const moment = require('moment');
const fs = require('fs');
const Evaluation = require('../models/Evaluation');
const Form = require('../models/Form');
const User = require('../models/User');
const OPTIONS = require('./options');
const TriggerNotification = require('./triggerNotification');
const getHtml = require('../common/getHtml');
const templateEnum = require('../common/TemplateEnum');
const Company = require('../models/Company');
const CompanyLocation = require('../models/CompanyLocation');
const UserLog = require('../controllers/api/v1/UserLog');
const emailReport = require('../config/emailReport');
const Excel = require('excel4node');
const path = require('path');
const mongoose = require('mongoose');
const {isUnsubscribeEmailTemplate} = require("../common/utils");
const {getSchemaModel, getDB, connectDB, closeDB, cronConnectDB} = require("../common/ExternalDBConnection");
const {findUserById} = require("../common/CommonMethods");
const {checkLocationIsGDPREnable, findAllGDPREnableLocations} = require("../common/CheckGDPREnable");
const CompanyTemplate = require('../models/CompanyTemplate');

async function sendFollowUpEmailWithGDPR(companiesList, now, ccEmailList, followDay, i, cronName, location) {

    try {
        let EvaluationModel = await getSchemaModel(OPTIONS.schemaName.EVALUATIONMODEL, cronName);
        let UserModel = User;
        /*
        if(companiesList[i]._id == '606315daa7ed0b00139a2b52'){
            let tempData = await EvaluationModel.find({
                company: mongoose.Types.ObjectId(companiesList[i]._id),
                // feedbackEmailSent: true,
                // feedbackCollection: true,
            });
            if(tempData && tempData.length > 0){
                for (const iterator of tempData) {
                    await EvaluationModel.findByIdAndUpdate(iterator._id, {
                        feedbackEmailSent: false,
                        feedbackCollection: false,
                        completedAt: now.toDate(),
                    });
                    console.log("LB-44",iterator._id, iterator.email);
                }
            }
        }
        */
        let evaluationCursor = await EvaluationModel.find({
            completedAt: {
                $lte: now.toDate()
            },
            //mainRating: { $ne: 0 },
            company: mongoose.Types.ObjectId(companiesList[i]._id),
            feedbackEmailSent: false,
            feedbackCollection: false,
            isQc: true,
            isQcDone: true,
            evaluationProgress: OPTIONS.evaluationProgress.COMPLETED
        });

        if (evaluationCursor.length > 0) {
            for (let k = 0; k < evaluationCursor.length; k++) {
                UserModel = User;
                let userId = evaluationCursor[k].user;
                let u = null;
                let user = {
                    email: evaluationCursor[k].email,
                    profile: { name: evaluationCursor[k].name }
                };
                if (evaluationCursor[k].individual) {
                    userId = evaluationCursor[k].individual;
                    user = await findUserById(evaluationCursor[k].individual, cronName);
                    u = await User.findById(evaluationCursor[k].individual);
                    if (!u) {
                        UserModel = await getSchemaModel(OPTIONS.schemaName.USERMODEL, cronName);
                        u = await UserModel.findById(evaluationCursor[k].individual);
                    }
                    await UserModel.findByIdAndUpdate(evaluationCursor[k].individual, { $set: { currentStatus: 'Review questionnaire sent. Awaiting completion' } }, function (err) {
                        if (err) {
                            throw new Error(err);
                        }
                    });
                }
                if (evaluationCursor[k].company) {
                    if (evaluationCursor[k].user) {
                        userId = evaluationCursor[k].user;
                        user = await findUserById(evaluationCursor[k].user, cronName);
                        u = await User.findById(evaluationCursor[k].user);
                        if (!u) {
                            UserModel = await getSchemaModel(OPTIONS.schemaName.USERMODEL, cronName);
                            u = await UserModel.findById(evaluationCursor[k].user);
                        }
                        await UserModel.findByIdAndUpdate(evaluationCursor[k].user, { $set: { currentStatus: 'Review questionnaire sent. Awaiting completion' } }, function (err) {
                            if (err) {
                                throw new Error(err);
                            }
                        });
                    }
                }
                if (evaluationCursor[k].consultant) {
                    userId = evaluationCursor[k].consultant;
                    user = {
                        id: evaluationCursor[k].consultant,
                        profile: {
                            name: evaluationCursor[k].name
                        },
                        email: evaluationCursor[k].email
                    };
                    u = await User.findById(evaluationCursor[k].consultant);
                    if (!u) {
                        UserModel = await getSchemaModel(OPTIONS.schemaName.USERMODEL, cronName);
                        u = await UserModel.findById(evaluationCursor[k].consultant);
                    }
                    await UserModel.findByIdAndUpdate(evaluationCursor[k].consultant, { $set: { currentStatus: 'Review questionnaire sent. Awaiting completion' } }, function (err) {
                        if (err) {
                            throw new Error(err);
                        }
                    });
                }
                let userLog = {};
                userLog.user = userId;
                userLog.evaluation = evaluationCursor[k]._id;
                userLog.action = 'Review questionnaire sent. Awaiting completion';
                userLog.author = 'By System';
                let db = await getDB(cronName);
                if (!db && u && u.currentLocation && await checkLocationIsGDPREnable(u.currentLocation)) {
                    let loc = await CompanyLocation.findById(u.currentLocation);
                    await cronConnectDB(loc, cronName);
                    await UserLog.postLog(userLog, cronName);
                    await closeDB();
                } else {
                    UserLog.postLog(userLog, cronName);
                }

                if (!user) {
                    user = {
                        email: evaluationCursor[k].email,
                        profile: { name: evaluationCursor[k].name }
                    };
                }
                let tempName = (user.profile.lastname) ? user.profile.name+' '+user.profile.lastname : user.profile.name;
                let replaceObj = {
                    evaluation: (evaluationCursor[k].company) ? "Self Assessment" : "Ergonomist Evaluation",
                    workstation: (evaluationCursor[k].workStation) ? OPTIONS.evaluationWorkStations[evaluationCursor[k].workStation] : OPTIONS.evaluationWorkStations['OTHER_WORK_STATION'],
                    name: tempName,
                    day: followDay,
                    buttonText: 'Feedback',
                    unsubscribeLink: OPTIONS.genAbsoluteUrl('user/unsubscribe/' + userId, 'base'),
                    redirectionLink: OPTIONS.genAbsoluteUrl('/evaluation/' + evaluationCursor[k]._id + '/' + userId + '/feedback/' + (u && u.currentLocation ? u.currentLocation : 'location'), 'site'),
                    mailMessage: [
                        { 'data': 'It has been two weeks since you completed your ergonomics self-assessment and we wanted to check in with you and see how you are finding your new desk setup. Over the last two weeks, we hope that you have been able to implement the strategies recommended to you and are more aware of the importance of posture and positioning while at work. Small changes can make a significant impact on your overall comfort. It can take some time to get used to a new setup but we encourage you to work with it and find the solution/setup that works best for you while hopefully, reducing any pains or discomfort you may have been feeling.' },
                    ],
                    bottomMailMessage: [
                        { 'data': 'To assist you further, we recommend that you take 3 minutes to complete the \'Ergonomics Evaluation\' survey. This will let us know how you are getting on and if you need any further support from us.' },
                        { 'data': `To access your Fit for Work profile, please login <a href="https://ergoeval.fitforworksg.com/login">here </a>` },
                    ],
                };
                await EvaluationModel.findByIdAndUpdate(evaluationCursor[k]._id, { $set: { feedbackEmailSent: true, followUpSendAt: Date.now() } });
                let company = await Company.findById(evaluationCursor[k].company);
                let isUnsubscribeTemplate = isUnsubscribeEmailTemplate('FOLLOW_UP_EMAIL');
                let userByUserId = userId ? await UserModel.findOne({ _id: userId }) : null;
                let isUserUnsubscribe = (userByUserId != null && userByUserId.isUnsubscribe && userByUserId.isUnsubscribe == true);
                if (!isUnsubscribeTemplate || (isUnsubscribeTemplate && !isUserUnsubscribe)) {
                    getHtml.getHtmlFromTemplate(templateEnum.get('FOLLOW_UP_EMAIL'), company, replaceObj, location)
                        .then((html) => {
                            getHtml.getHtmlFromSubject(templateEnum.get('FOLLOW_UP_EMAIL'), company, replaceObj, location)
                                .then((subject) => {
                                    TriggerNotification.triggerEMAIL(user.email, ccEmailList, subject, null, html)
                                        .then(function (info) {
                                            const setData = {
                                                companyId: company ? company._id : null,
                                                companyName: company ? company.name : '',
                                                userId: userId ? userId : null,
                                                evaluationId: evaluationCursor ? evaluationCursor[k]._id : null,
                                                evaluationName: evaluationCursor ? evaluationCursor[k].name : '',
                                                userName: tempName ? tempName : '',
                                                userEmail: user ? user.email : '',
                                                subject: subject,
                                                message: html,
                                                emailStatus: "success",
                                            }
                                            emailReport.setEmailReport(setData);
                                        })
                                        .catch((err) => {
                                            const setData = {
                                                companyId: company ? company._id : null,
                                                companyName: company ? company.name : '',
                                                userId: userId ? userId : null,
                                                evaluationId: evaluationCursor ? evaluationCursor[k]._id : null,
                                                evaluationName: evaluationCursor ? evaluationCursor[k].name : '',
                                                userName: tempName ? tempName : '',
                                                userEmail: user ? user.email : '',
                                                subject: subject,
                                                message: html,
                                                emailStatus: "failure",
                                            }
                                            emailReport.setEmailReport(setData);
                                            return new Error(err);
                                        });
                                })
                                .catch((err) => {
                                    return new Error(err);
                                })
                        })
                }
            }
        }
    } catch (e) {
        throw new Error(e)
    }
}

exports.sendFollowUpEmail = async function () {
    try {
        let followupFrequency = OPTIONS.evaluationFeedbackAfter;
        let companiesList = await Company.find({ status: OPTIONS.companyStatus.ACTIVE }).allowDiskUse(true).exec();
        for (let i = 0; i < companiesList.length; i++) {
            var followDay = 14;
            if (companiesList[i].followupFrequency !== null) {
                followupFrequency = companiesList[i].followupFrequency * 24;
                followDay = companiesList[i].followupFrequency;
            } else {
                followupFrequency = OPTIONS.evaluationFeedbackAfter;
            }
            let now = moment();
            now = moment().subtract(followupFrequency, 'hours');

            let ccEmailList = null;
            if (companiesList[i].ccEmail && companiesList[i].ccEmail.length > 0) {
                ccEmailList = companiesList[i].ccEmail;
            }

            // We dont need here cron name thats why passing as test name
            await sendFollowUpEmailWithGDPR(companiesList, now, ccEmailList, followDay, i, 'test', null);

            let locations = await findAllGDPREnableLocations();

            if (locations && locations.length > 0) {
                let cronName = 'sendFollowUpEmail';
                for (let j = 0; j < locations.length; j++) {
                    let location = await CompanyLocation.findById(locations[j].id);
                    if (await checkLocationIsGDPREnable(location.id)) {
                        cronName = 'sendFollowUpEmail'+location.locationName.replace(/ /g, '+');
                        let db = await cronConnectDB(location, cronName);
                        await sendFollowUpEmailWithGDPR(companiesList, now, ccEmailList, followDay, i, cronName, location);
                        await closeDB(cronName);
                    }
                }
            }
        }
    } catch (e) {
        console.log("cronConstroller catch => ", e);
        throw new Error(e)
    }
};

async function sendIndividualFollowUpEmailWithGDPR(followDay, followupFrequency, now, cronName, location) {

    try {
        let EvaluationModel = await getSchemaModel(OPTIONS.schemaName.EVALUATIONMODEL, cronName);
        let UserModel = User;
        let evaluationCursor = await EvaluationModel.find({
            completedAt: {
                $lte: now.toDate()
            },
            company: null,
            feedbackEmailSent: false,
            feedbackCollection: false,
            isQc: true,
            isQcDone: true,
            evaluationProgress: OPTIONS.evaluationProgress.COMPLETED
        });

        if (evaluationCursor.length > 0) {
            for (let k = 0; k < evaluationCursor.length; k++) {
                UserModel = User;
                await EvaluationModel.findByIdAndUpdate(evaluationCursor[k]._id, { $set: { feedbackEmailSent: true, followUpSendAt: Date.now() } });
                let userId = evaluationCursor[k].user;
                let u;
                if (userId) {
                    u = await User.findById(userId);
                    if (!u) {
                        UserModel = await getSchemaModel(OPTIONS.schemaName.USERMODEL, cronName);
                        u = await UserModel.findById(userId);
                    }
                }
                let user = {
                    email: evaluationCursor[k].email,
                    profile: { name: evaluationCursor[k].name }
                };

                let tempName = (user.profile.lastname) ? user.profile.name+' '+user.profile.lastname : user.profile.name;
                let replaceObj = {
                    name: tempName,
                    day: followDay,
                    buttonText: 'Feedback',
                    redirectionLink: OPTIONS.genAbsoluteUrl('evaluation/' + evaluationCursor[k]._id + '/' + userId + '/feedback/' + (u && u.currentLocation ? u.currentLocation : 'location'), 'site'),
                    unsubscribeLink: OPTIONS.genAbsoluteUrl('user/unsubscribe/' + userId, 'base'),
                    mailMessage: [
                        { 'data': 'It has been two weeks since you completed your ergonomics self-assessment and we wanted to check in with you and see how you are finding your new desk setup. Over the last two weeks, we hope that you have been able to implement the strategies recommended to you and are more aware of the importance of posture and positioning while at work. Small changes can make a significant impact on your overall comfort. It can take some time to get used to a new setup but we encourage you to work with it and find the solution/setup that works best for you while hopefully, reducing any pains or discomfort you may have been feeling.' },
                    ],
                    bottomMailMessage: [
                        { 'data': 'To assist you further, we recommend that you take 3 minutes to complete the \'Ergonomics Evaluation\' survey. This will let us know how you are getting on and if you need any further support from us.' },
                        { 'data': `To access your Fit for Work profile, please login <a href="https://ergoeval.fitforworksg.com/login">here </a>` },
                    ],
                };
                let isUnsubscribeTemplate = isUnsubscribeEmailTemplate('FOLLOW_UP_EMAIL');
                let userByUserId = userId ? await UserModel.findOne({ _id: userId }) : null;
                let isUserUnsubscribe = (userByUserId != null && userByUserId.isUnsubscribe && userByUserId.isUnsubscribe == true);
                if (!isUnsubscribeTemplate || (isUnsubscribeTemplate && !isUserUnsubscribe)) {
                    getHtml.getHtmlFromTemplate(templateEnum.get('FOLLOW_UP_EMAIL'), null, replaceObj, location)
                        .then((html) => {
                            getHtml.getHtmlFromSubject(templateEnum.get('FOLLOW_UP_EMAIL'), null, replaceObj, location)
                                .then((subject) => {
                                    TriggerNotification.triggerEMAIL(user.email, null, subject, null, html)
                                        .then(function (info) {
                                            const setData = {
                                                companyId: company ? company._id : null,
                                                companyName: company ? company.name : '',
                                                userId: userId ? userId : null,
                                                evaluationId: evaluationCursor ? evaluationCursor[k]._id : null,
                                                evaluationName: evaluationCursor ? evaluationCursor[k].name : '',
                                                userName: tempName ? tempName : '',
                                                userEmail: user ? user.email : '',
                                                subject: subject,
                                                message: html,
                                                emailStatus: "success",
                                            }
                                            emailReport.setEmailReport(setData);
                                        })
                                        .catch((err) => {
                                            const setData = {
                                                companyId: company ? company._id : null,
                                                companyName: company ? company.name : '',
                                                userId: userId ? userId : null,
                                                evaluationId: evaluationCursor ? evaluationCursor[k]._id : null,
                                                evaluationName: evaluationCursor ? evaluationCursor[k].name : '',
                                                userName: tempName ? tempName : '',
                                                userEmail: user ? user.email : '',
                                                subject: subject,
                                                message: html,
                                                emailStatus: "failure",
                                            }
                                            emailReport.setEmailReport(setData);
                                            return new Error(err);
                                        });
                                })
                                .catch((err) => {
                                    return new Error(err);
                                })
                        })
                }
            }
        }
    } catch (e) {
        throw new Error(e)
    }
}

exports.sendIndividualFollowUpEmail = async function () {
    try {
        followupFrequency = OPTIONS.evaluationFeedbackAfter;
        followDay = 14;

        let now = moment();
        now = moment().subtract(followupFrequency, 'hours');

        // We dont need here cron name thats why passing as test name
        await sendIndividualFollowUpEmailWithGDPR(followDay, followupFrequency, now, 'test', null);

        let locations = await findAllGDPREnableLocations();

        if (locations && locations.length > 0) {
            let cronName = 'sendIndividualFollowUpEmail';
            for (let i = 0; i < locations.length; i++) {
                let location = await CompanyLocation.findById(locations[i].id);
                if (await checkLocationIsGDPREnable(location.id)) {
                    cronName = 'sendIndividualFollowUpEmail'+location.locationName.replace(/ /g, '+');
                    let db = await cronConnectDB(location, cronName);
                    await sendIndividualFollowUpEmailWithGDPR(followDay, followupFrequency, now, cronName, location);
                    await closeDB(cronName);
                }
            }
        }

    } catch (e) {
        throw new Error(e)
    }
};

async function archiveEvaluationsWithLocation(cronName) {
    try {
        let EvaluationModel = await getSchemaModel(OPTIONS.schemaName.EVALUATIONMODEL, cronName);
        let now = moment().subtract(OPTIONS.evaluationArchive, 'hours').toDate();
        let evaluations = await EvaluationModel.find({
            status: OPTIONS.evaluationStatus.ACTIVE,
            consultant: {$exists: true, $ne: null},
            createdAt: {$lte: now}
        });
        if (evaluations && evaluations.length > 0) {
            for (let i = 0; i < evaluations.length; i++) {
                await EvaluationModel.findOneAndUpdate({
                    id: evaluations[i].id
                }, {
                    $set: {
                        status: OPTIONS.evaluationStatus.ARCHIVE,
                    }
                });
            }
        }
    } catch (e) {
        throw new Error(e)
    }
};

exports.archiveEvaluations = async function () {
    try {
        await archiveEvaluationsWithLocation('test');

        let locations = await findAllGDPREnableLocations();

        if (locations && locations.length > 0) {
            let cronName = 'sendIndividualFollowUpEmail';
            for (let i = 0; i < locations.length; i++) {
                let location = await CompanyLocation.findById(locations[i].id);
                if (await checkLocationIsGDPREnable(location.id)) {
                    cronName = 'archiveEvaluations'+location.locationName.replace(/ /g, '+');
                    let db = await cronConnectDB(location, cronName);
                    await archiveEvaluationsWithLocation(cronName);
                    await closeDB(cronName);
                }
            }
        }

        /*await Evaluation.findAndModify({
            status: OPTIONS.evaluationStatus.ACTIVE,
            consultant: { $exists: true, $ne: null },
            createdAt: { $lte: now }
        }, {
            $set: {
                status: OPTIONS.evaluationStatus.ARCHIVE,
            }
        })*/
    } catch (e) {
        throw new Error(e)
    }
};

async function send5DayEvalIncompMailWithGDPR(now, cronName, location) {
    try {
        let EvaluationModel = await getSchemaModel(OPTIONS.schemaName.EVALUATIONMODEL, cronName);
        let UserModel = User;
        let evaluationCursor = await EvaluationModel.find({
            updatedAt: {
                $lte: now.toDate()
            },
            evaluationProgress: OPTIONS.evaluationProgress.IN_COMPLETED,
            fiveDayEmailSent: false
        });

        for (let k = 0; k < evaluationCursor.length; k++) {
            let userId = evaluationCursor[k].user;
            await EvaluationModel.findByIdAndUpdate(evaluationCursor[k]._id, { $set: { fiveDayEmailSent: true } });

            let replaceObj = {
                name: evaluationCursor[k].name,
                redirectionLink: OPTIONS.genAbsoluteUrl('login', 'site'),
                unsubscribeLink: OPTIONS.genAbsoluteUrl('user/unsubscribe/' + userId, 'base'),
                buttonText: 'Login'
            };
            var emailArray = ['software@fitforworksg.com'];
            UserModel = User;
            if (userId) {
                let u = await User.findById(userId);
                if (!u) {
                    UserModel = await getSchemaModel(OPTIONS.schemaName.USERMODEL, cronName);
                }
            }
            let company = await Company.findById(evaluationCursor[k].company);
            let isUnsubscribeTemplate = isUnsubscribeEmailTemplate('SELF_EVALUATION_5DAY_EMAIL');
            let userByUserId = userId ? await UserModel.findOne({ _id: userId }) : null;
            let isUserUnsubscribe = (userByUserId != null && userByUserId.isUnsubscribe && userByUserId.isUnsubscribe == true);
            if (!isUnsubscribeTemplate || (isUnsubscribeTemplate && !isUserUnsubscribe)) {
                getHtml.getHtmlFromTemplate(templateEnum.get('SELF_EVALUATION_5DAY_EMAIL'), company, replaceObj, location)
                    .then((html) => {
                        getHtml.getHtmlFromSubject(templateEnum.get('SELF_EVALUATION_5DAY_EMAIL'), company, replaceObj, location)
                            .then((subject) => {
                                TriggerNotification.triggerEMAIL(evaluationCursor[k].email, emailArray, subject, null, html)
                                    .then(function (info) {
                                        const setData = {
                                            companyId: company ? company._id : null,
                                            companyName: company ? company.name : '',
                                            userId: userId ? userId : null,
                                            evaluationId: evaluationCursor ? evaluationCursor[k]._id : null,
                                            evaluationName: evaluationCursor ? evaluationCursor[k].name : '',
                                            userName: evaluationCursor ? evaluationCursor[k].name : '',
                                            userEmail: evaluationCursor ? evaluationCursor[k].email : '',
                                            subject: subject,
                                            message: html,
                                            emailStatus: "success",
                                        }
                                        emailReport.setEmailReport(setData);
                                    })
                                    .catch((err) => {
                                        const setData = {
                                            companyId: company ? company._id : null,
                                            companyName: company ? company.name : '',
                                            userId: userId ? userId : null,
                                            evaluationId: evaluationCursor ? evaluationCursor[k]._id : null,
                                            evaluationName: evaluationCursor ? evaluationCursor[k].name : '',
                                            userName: evaluationCursor ? evaluationCursor[k].name : '',
                                            userEmail: evaluationCursor ? evaluationCursor[k].email : '',
                                            subject: subject,
                                            message: html,
                                            emailStatus: "failure",
                                        }
                                        emailReport.setEmailReport(setData);
                                        return new Error(err);
                                    });
                            })
                            .catch((err) => {
                                return new Error(err);
                            })
                    })
            }
            //return false;
        }
    } catch (e) {
        throw new Error(e)
    }
}

exports.send5DayEvalIncompMail = async function () {
    try {
        let now = moment();
        now = moment().subtract(5, 'days');

        // We dont need here cron name thats why passing as test name
        await send5DayEvalIncompMailWithGDPR(now, 'test', null);

        let locations = await findAllGDPREnableLocations();

        if (locations && locations.length > 0) {
            let cronName = 'send5DayEvalIncompMail';
            for (let i = 0; i < locations.length; i++) {
                let location = await CompanyLocation.findById(locations[i].id);
                if (await checkLocationIsGDPREnable(location.id)) {
                    cronName = 'send5DayEvalIncompMail'+location.locationName.replace(/ /g, '+');
                    let db = await cronConnectDB(location, cronName);
                    await send5DayEvalIncompMailWithGDPR(now, cronName, location);
                    await closeDB(cronName);
                }
            }
        }
    } catch (e) {
        throw new Error(e)
    }
};


async function checkPasswordExpiryWithGDPR(now, cronName, location) {

    try {
        let UserModel = await getSchemaModel(OPTIONS.schemaName.USERMODEL, cronName);
        let users = await UserModel.find({
            createdAt: {
                $lte: now.toDate()
            },
            notifyEmail: false,
            status: [OPTIONS.userStatus.ACTIVE],
            $or: [{ isSsoUser: false }, { isSsoUser: { $exists: false } }]
        });

        for (let k = 0; k < users.length; k++) {
            if (users[k].lastPasswordUpdate) {
                if (users[k].lastPasswordUpdate <= now.toDate()) {
                    await UserModel.findByIdAndUpdate(users[k]._id, { $set: { notifyEmail: true } });
                    let tempName = (users[k].profile.lastname) ? users[k].profile.name+' '+users[k].profile.lastname : users[k].profile.name;
                    let replaceObj = {
                        name: tempName,
                        unsubscribeLink: OPTIONS.genAbsoluteUrl('user/unsubscribe/' + users[k]._id, 'base')
                    };

                    let company = await Company.findById(users[k].company);
                    let isUnsubscribeTemplate = isUnsubscribeEmailTemplate('PASSWORD_EXPIRY_NOTIFICATION');
                    let userByUserId = users[k] ? await UserModel.findOne({ _id: users[k]._id }) : null;
                    let isUserUnsubscribe = (userByUserId != null && userByUserId.isUnsubscribe && userByUserId.isUnsubscribe == true);
                    if (!isUnsubscribeTemplate || (isUnsubscribeTemplate && !isUserUnsubscribe)) {
                        getHtml.getHtmlFromTemplate(templateEnum.get('PASSWORD_EXPIRY_NOTIFICATION'), company, replaceObj, location)
                            .then((html) => {
                                getHtml.getHtmlFromSubject(templateEnum.get('PASSWORD_EXPIRY_NOTIFICATION'), company, replaceObj, location)
                                    .then((subject) => {
                                        TriggerNotification.triggerEMAIL(users[k].email, null, subject, null, html)
                                            .then(function (info) {
                                                const setData = {
                                                    companyId: company ? company._id : null,
                                                    companyName: company ? company.name : '',
                                                    userId: users ? users._id : null,
                                                    evaluationId: null,
                                                    evaluationName: '',
                                                    userName: tempName ? tempName : '',
                                                    userEmail: users ? users.email : '',
                                                    subject: subject,
                                                    message: html,
                                                    emailStatus: "success",
                                                }
                                                emailReport.setEmailReport(setData);
                                            })
                                            .catch((err) => {
                                                const setData = {
                                                    companyId: company ? company._id : null,
                                                    companyName: company ? company.name : '',
                                                    userId: users ? users._id : null,
                                                    evaluationId: null,
                                                    evaluationName: '',
                                                    userName: tempName ? tempName : '',
                                                    userEmail: users ? users.email : '',
                                                    subject: subject,
                                                    message: html,
                                                    emailStatus: "failure",
                                                }
                                                emailReport.setEmailReport(setData);
                                                return new Error(err);
                                            });
                                    })
                                    .catch((err) => {
                                        return new Error(err);
                                    })
                            })
                    }
                }
            } else {
                await UserModel.findByIdAndUpdate(users[k]._id, { $set: { notifyEmail: true } });
                let tempName = (users[k].profile.lastname) ? users[k].profile.name+' '+users[k].profile.lastname : users[k].profile.name;
                let replaceObj = {
                    name: tempName,
                    unsubscribeLink: OPTIONS.genAbsoluteUrl('user/unsubscribe/' + users[k]._id, 'base')
                };
                let company = await Company.findById(users[k].company);
                let isUnsubscribeTemplate = isUnsubscribeEmailTemplate('PASSWORD_EXPIRY_NOTIFICATION');
                let userByUserId = users[k] ? await UserModel.findOne({ _id: users[k]._id }) : null;
                let isUserUnsubscribe = (userByUserId != null && userByUserId.isUnsubscribe && userByUserId.isUnsubscribe == true);
                if (!isUnsubscribeTemplate || (isUnsubscribeTemplate && !isUserUnsubscribe)) {
                    getHtml.getHtmlFromTemplate(templateEnum.get('PASSWORD_EXPIRY_NOTIFICATION'), company, replaceObj, location)
                        .then((html) => {
                            getHtml.getHtmlFromSubject(templateEnum.get('PASSWORD_EXPIRY_NOTIFICATION'), company, replaceObj, location)
                                .then((subject) => {
                                    TriggerNotification.triggerEMAIL(users[k].email, null, subject, null, html)
                                        .then(function (info) {
                                            const setData = {
                                                companyId: company ? company._id : null,
                                                companyName: company ? company.name : '',
                                                userId: users ? users._id : null,
                                                evaluationId: null,
                                                evaluationName: '',
                                                userName: tempName ? tempName : '',
                                                userEmail: users ? users.email : '',
                                                subject: subject,
                                                message: html,
                                                emailStatus: "success",
                                            }
                                            emailReport.setEmailReport(setData);
                                        })
                                        .catch((err) => {
                                            const setData = {
                                                companyId: company ? company._id : null,
                                                companyName: company ? company.name : '',
                                                userId: users ? users._id : null,
                                                evaluationId: null,
                                                evaluationName: '',
                                                userName: tempName ? tempName : '',
                                                userEmail: users ? users.email : '',
                                                subject: subject,
                                                message: html,
                                                emailStatus: "failure",
                                            }
                                            emailReport.setEmailReport(setData);
                                            return new Error(err);
                                        });
                                })
                                .catch((err) => {
                                    return new Error(err);
                                })
                        })
                }
            }
        }
    } catch (e) {
        throw new Error(e)
    }

}

exports.checkPasswordExpiry = async function () {
    try {
        let now = moment();
        now = moment().subtract(90, 'days');

        // We dont need here cron name thats why passing as test name
        await checkPasswordExpiryWithGDPR(now, 'test', null);

        let locations = await findAllGDPREnableLocations();

        if (locations && locations.length > 0) {
            let cronName = 'checkPasswordExpiry';
            for (let i = 0; i < locations.length; i++) {
                let location = await CompanyLocation.findById(locations[i].id);
                if (await checkLocationIsGDPREnable(location.id)) {
                    cronName = 'checkPasswordExpiry'+location.locationName.replace(/ /g, '+');
                    let db = await cronConnectDB(location, cronName);
                    await checkPasswordExpiryWithGDPR(now, cronName, location);
                    await closeDB(cronName);
                }
            }
        }
    } catch (e) {
        throw new Error(e)
    }
};


async function sendDataDeleteNotifyWithGDPR(now, deleteDate, cronName, location) {

    try {
        let UserModel = await getSchemaModel(OPTIONS.schemaName.USERMODEL, cronName);
        let users = await UserModel.find({
            lastLoginAt: {
                $lte: now.toDate()
            },
            status: [OPTIONS.userStatus.ACTIVE]
        });
        for (let k = 0; k < users.length; k++) {
            if (users[k].dataDeleteNotify == null || users[k].dataDeleteNotify === false) {
                let tempName = (users[k].profile.lastname) ? users[k].profile.name+' '+users[k].profile.lastname : users[k].profile.name;
                let replaceObj = {
                    name: tempName,
                    date: deleteDate,
                    unsubscribeLink: OPTIONS.genAbsoluteUrl('user/unsubscribe/' + users[k]._id, 'base')
                };
                let company = await Company.findById(users[k].company);
                await UserModel.findByIdAndUpdate(users[k]._id, { $set: { dataDeleteNotify: true } }, function (err) {
                    if (err) {
                        throw new Error(err);
                    }
                });
                let isUnsubscribeTemplate = isUnsubscribeEmailTemplate('DATA_DELETION_NOTIFICATION');
                let userByUserId = users[k] ? await UserModel.findOne({ _id: users[k]._id }) : null;
                let isUserUnsubscribe = (userByUserId != null && userByUserId.isUnsubscribe && userByUserId.isUnsubscribe == true);
                if (!isUnsubscribeTemplate || (isUnsubscribeTemplate && !isUserUnsubscribe)) {
                    getHtml.getHtmlFromTemplate(templateEnum.get('DATA_DELETION_NOTIFICATION'), company, replaceObj, location)
                        .then((html) => {
                            getHtml.getHtmlFromSubject(templateEnum.get('DATA_DELETION_NOTIFICATION'), company, replaceObj, location)
                                .then((subject) => {
                                    TriggerNotification.triggerEMAIL(users[k].email, null, subject, null, html)
                                        .then(function (info) {
                                            const setData = {
                                                companyId: company ? company._id : null,
                                                companyName: company ? company.name : '',
                                                userId: users ? users._id : null,
                                                evaluationId: null,
                                                evaluationName: '',
                                                userName: tempName ? tempName : '',
                                                userEmail: users ? users.email : '',
                                                subject: subject,
                                                message: html,
                                                emailStatus: "success",
                                            }
                                            emailReport.setEmailReport(setData);
                                        })
                                        .catch((err) => {
                                            const setData = {
                                                companyId: company ? company._id : null,
                                                companyName: company ? company.name : '',
                                                userId: users ? users._id : null,
                                                evaluationId: null,
                                                evaluationName: '',
                                                userName: tempName ? tempName : '',
                                                userEmail: users ? users.email : '',
                                                subject: subject,
                                                message: html,
                                                emailStatus: "failure",
                                            }
                                            emailReport.setEmailReport(setData);
                                            return new Error(err);
                                        });
                                })
                                .catch((err) => {
                                    return new Error(err);
                                })
                        })
                }
            }
        }
    } catch (e) {
        throw new Error(e)
    }
}

exports.sendDataDeleteNotify = async function () {
    try {
        let now = moment();
        now = moment().subtract(350, 'days');
        let deleteDate = moment().add(15, 'days').calendar();

        // We dont need here cron name thats why passing as test name
        await sendDataDeleteNotifyWithGDPR(now, deleteDate, 'test', null);

        let locations = await findAllGDPREnableLocations();

        if (locations && locations.length > 0) {
            let cronName = 'sendDataDeleteNotify';
            for (let i = 0; i < locations.length; i++) {
                let location = await CompanyLocation.findById(locations[i].id);
                if (await checkLocationIsGDPREnable(location.id)) {
                    cronName = 'sendDataDeleteNotify'+location.locationName.replace(/ /g, '+');
                    let db = await cronConnectDB(location, cronName);
                    await sendDataDeleteNotifyWithGDPR(now, deleteDate, cronName, location);
                    await closeDB(cronName);
                }
            }
        }
    } catch (e) {
        throw new Error(e)
    }
};


async function sendReportEmailWithGDPR(cronName, location) {

    try {
        let UserModel = await getSchemaModel(OPTIONS.schemaName.USERMODEL, cronName);
        let users = await UserModel.find({
            status: [OPTIONS.userStatus.ACTIVE],
            roles: OPTIONS.usersRoles.COMPANY_ADMIN
        });
        for (let k = 0; k < users.length; k++) {
            let company = await Company.findById(users[k].company);
            let userQuery;
            if (users[k].profileCreateBy === '') {
                userQuery = {
                    company: users[k].company,
                    roles: OPTIONS.usersRoles.COMPANY_EMPLOYEE,
                    status: [OPTIONS.userStatus.ACTIVE],
                };
            } else {
                userQuery = {
                    company: users[k].company,
                    roles: OPTIONS.usersRoles.COMPANY_EMPLOYEE,
                    status: [OPTIONS.userStatus.ACTIVE],
                    currentLocation: {
                        $in: users[k].locations.map(e => e.id)
                    }
                };
            }

            let companyUsers = await UserModel.find(userQuery, 'profile.name profile.lastname email currentLocation currentStatus createdAt mainRating updateRating latestRating riskScoreByType').sort({ createdAt: -1 });

            if (companyUsers && companyUsers.length > 0) {
                var workbook = new Excel.Workbook();
                var worksheet = workbook.addWorksheet('Sheet 1');
                // Create a reusable style
                var style = workbook.createStyle({
                    font: {
                        color: '#000000',
                        size: 12
                    }
                });

                // Set value of cell A1 to 100 as a number type styled with paramaters of style
                let column = 0;
                worksheet.cell(1, (column = column+1)).string('S.no').style(style);
                worksheet.cell(1, (column = column+1)).string('Name').style(style);
                worksheet.cell(1, (column = column+1)).string('Email').style(style);
                worksheet.cell(1, (column = column+1)).string('Status').style(style);
                worksheet.cell(1, (column = column+1)).string('Current Location').style(style);
                worksheet.cell(1, (column = column+1)).string('User Profile Created On').style(style);
                /*
                worksheet.cell(1, (column = column+1)).string('Evaluation risk score').style(style);
                worksheet.cell(1, (column = column+1)).string('Updated risk score').style(style);
                worksheet.cell(1, (column = column+1)).string('Latest risk score').style(style);
                */

                worksheet.cell(1, (column = column+1)).string('Home Evalution risk score').style(style);
                worksheet.cell(1, (column = column+1)).string('Home Updated risk score').style(style);
                worksheet.cell(1, (column = column+1)).string('Home Latest risk score').style(style);

                worksheet.cell(1, (column = column+1)).string('Office Evalution risk score').style(style);
                worksheet.cell(1, (column = column+1)).string('Office Updated risk score').style(style);
                worksheet.cell(1, (column = column+1)).string('Office Latest risk score').style(style);

                worksheet.cell(1, (column = column+1)).string('Other Evalution risk score').style(style);
                worksheet.cell(1, (column = column+1)).string('Other Updated risk score').style(style);
                worksheet.cell(1, (column = column+1)).string('Other Latest risk score').style(style);

                // worksheet.cell(1, (column = column+1)).string('riskScoreByType').style(style);

                for (var i = 0; i < companyUsers.length; i++) {
                    column = 0;
                    let tempName = (companyUsers[i].profile.lastname) ? companyUsers[i].profile.name+' '+companyUsers[i].profile.lastname : companyUsers[i].profile.name;
                    worksheet.cell(i + 2, (column = column+1),).number(i + 1).style(style);
                    worksheet.cell(i + 2, (column = column+1),).string(tempName).style(style);
                    worksheet.cell(i + 2, (column = column+1),).string(companyUsers[i].email).style(style);
                    worksheet.cell(i + 2, (column = column+1),).string(companyUsers[i].currentStatus).style(style);
                    // get current location name
                    if (companyUsers[i].currentLocation) {
                        let loc = await CompanyLocation.findById(mongoose.Types.ObjectId(companyUsers[i].currentLocation));
                        if (loc && loc.locationName) {
                            worksheet.cell(i + 2, (column = column+1),).string(loc.locationName).style(style);
                        } else {
                            worksheet.cell(i + 2, (column = column+1),).string('N/A').style(style);
                        }
                    } else {
                        worksheet.cell(i + 2, (column = column+1),).string('N/A').style(style);
                    }

                    worksheet.cell(i + 2, (column = column+1),).date(new Date(companyUsers[i].createdAt)).style({ numberFormat: 'yyyy-mm-dd' });
                    /*
                    if (companyUsers[i].mainRating != 0) {
                        worksheet.cell(i + 2, 7,).number(companyUsers[i].mainRating).style(style);
                    } else {
                        worksheet.cell(i + 2, 7,).string('N/A').style(style);
                    }
                    if (companyUsers[i].updateRating != 0) {
                        worksheet.cell(i + 2, 8,).number(companyUsers[i].updateRating).style(style);
                    } else {
                        worksheet.cell(i + 2, 8,).string('N/A').style(style);
                    }
                    if (companyUsers[i].latestRating != 0) {
                        worksheet.cell(i + 2, 9,).number(companyUsers[i].latestRating).style(style);
                    } else {
                        worksheet.cell(i + 2, 9,).string('N/A').style(style);
                    }
                    */
                    let riskScoreByType = companyUsers[i].riskScoreByType;
                    // worksheet.cell(i + 2, 10,).string(riskScoreByType.HOME_WORK_STATION.mainRating).style(style);
                    if(riskScoreByType){
                        /** Only Home Work Station */
                        if(riskScoreByType.HOME_WORK_STATION){
                            if(riskScoreByType.HOME_WORK_STATION.mainRating){
                                worksheet.cell(i + 2, (column = column+1),).number(riskScoreByType.HOME_WORK_STATION.mainRating).style(style);
                            }else{
                                worksheet.cell(i + 2, (column = column+1),).string('N/A').style(style);
                            }
                            if(riskScoreByType.HOME_WORK_STATION.updateRating){
                                worksheet.cell(i + 2, (column = column+1),).number(riskScoreByType.HOME_WORK_STATION.updateRating).style(style);
                            }else{
                                worksheet.cell(i + 2, (column = column+1),).string('N/A').style(style);
                            }
                            if(riskScoreByType.HOME_WORK_STATION.latestRating){
                                worksheet.cell(i + 2, (column = column+1),).number(riskScoreByType.HOME_WORK_STATION.latestRating).style(style);
                            }else{
                                worksheet.cell(i + 2, (column = column+1),).string('N/A').style(style);
                            }
                        }else{
                            worksheet.cell(i + 2, (column = column+1),).string('N/A').style(style);
                            worksheet.cell(i + 2, (column = column+1),).string('N/A').style(style);
                            worksheet.cell(i + 2, (column = column+1),).string('N/A').style(style);
                        }
                        
                        /** Only Office Work Station */
                        if(riskScoreByType.OFFICE_WORK_STATION){
                            if(riskScoreByType.OFFICE_WORK_STATION.mainRating){
                                worksheet.cell(i + 2, (column = column+1),).number(riskScoreByType.OFFICE_WORK_STATION.mainRating).style(style);
                            }else{
                                worksheet.cell(i + 2, (column = column+1),).string('N/A').style(style);
                            }
                            if(riskScoreByType.OFFICE_WORK_STATION.updateRating){
                                worksheet.cell(i + 2, (column = column+1),).number(riskScoreByType.OFFICE_WORK_STATION.updateRating).style(style);
                            }else{
                                worksheet.cell(i + 2, (column = column+1),).string('N/A').style(style);
                            }
                            if(riskScoreByType.OFFICE_WORK_STATION.latestRating){
                                worksheet.cell(i + 2, (column = column+1),).number(riskScoreByType.OFFICE_WORK_STATION.latestRating).style(style);
                            }else{
                                worksheet.cell(i + 2, (column = column+1),).string('N/A').style(style);
                            }
                        }else{
                            worksheet.cell(i + 2, (column = column+1),).string('N/A').style(style);
                            worksheet.cell(i + 2, (column = column+1),).string('N/A').style(style);
                            worksheet.cell(i + 2, (column = column+1),).string('N/A').style(style);
                        }
                        
                        /** Only Other Work Station */
                        if(riskScoreByType.OTHER_WORK_STATION){
                            if(riskScoreByType.OTHER_WORK_STATION.mainRating){
                                worksheet.cell(i + 2, (column = column+1),).number(riskScoreByType.OTHER_WORK_STATION.mainRating).style(style);
                            }else{
                                worksheet.cell(i + 2, (column = column+1),).string('N/A').style(style);
                            }
                            if(riskScoreByType.OTHER_WORK_STATION.updateRating){
                                worksheet.cell(i + 2, (column = column+1),).number(riskScoreByType.OTHER_WORK_STATION.updateRating).style(style);
                            }else{
                                worksheet.cell(i + 2, (column = column+1),).string('N/A').style(style);
                            }
                            if(riskScoreByType.OTHER_WORK_STATION.latestRating){
                                worksheet.cell(i + 2, (column = column+1),).number(riskScoreByType.OTHER_WORK_STATION.latestRating).style(style);
                            }else{
                                worksheet.cell(i + 2, (column = column+1),).string('N/A').style(style);
                            }
                        }else{
                            worksheet.cell(i + 2, (column = column+1),).number(companyUsers[i].mainRating).style(style);
                            worksheet.cell(i + 2, (column = column+1),).number(companyUsers[i].updateRating).style(style);
                            worksheet.cell(i + 2, (column = column+1),).number(companyUsers[i].latestRating).style(style);
                        }

                        // worksheet.cell(i + 2, (column = column+1),).string(riskScoreByType.HOME_WORK_STATION+"").style(style);
                    }else{

                    }
                }

                let filename = `Risk-scores-report-${Date.now()}.xlsx`;
                workbook.write('./public/evals/' + filename, function (err, stats) {
                    if (err) {
                        console.error(err);
                    } else {
                        let attachments = [{
                            filename: filename,
                            contentType: 'application/vnd.ms-excel',
                            path: path.resolve(__dirname, `../public/evals/${filename}`)
                        }];
                        let tempName = (users[k].profile.lastname) ? users[k].profile.name+' '+users[k].profile.lastname : users[k].profile.name;

                        let replaceObj = {
                            name: tempName,
                            unsubscribeLink: OPTIONS.genAbsoluteUrl('user/unsubscribe/' + users[k]._id, 'base')
                        };
                        let isUnsubscribeTemplate = isUnsubscribeEmailTemplate('REPORT_EMAIL');
                        let userByUserId = users[k];
                        let isUserUnsubscribe = (userByUserId != null && userByUserId.isUnsubscribe && userByUserId.isUnsubscribe == true);
                        if (!isUnsubscribeTemplate || (isUnsubscribeTemplate && !isUserUnsubscribe)) {
                            getHtml.getHtmlFromTemplate(templateEnum.get('REPORT_EMAIL'), company, replaceObj, location)
                                .then((html) => {
                                    getHtml.getHtmlFromSubject(templateEnum.get('REPORT_EMAIL'), company, replaceObj, location)
                                        .then((subject) => {
                                            TriggerNotification.triggerEMAIL(users[k].email, null, subject, null, html, attachments)
                                                .then(function (info) {
                                                    const setData = {
                                                        companyId: company ? company._id : null,
                                                        companyName: company ? company.name : '',
                                                        userId: users[k] ? users[k].id : null,
                                                        evaluationId: null,
                                                        evaluationName: '',
                                                        userName: tempName ? tempName : '',
                                                        userEmail: users[k] ? users[k].email : '',
                                                        subject: subject,
                                                        message: html,
                                                        emailStatus: "success",
                                                    }
                                                    emailReport.setEmailReport(setData);
                                                    fs.unlinkSync(path.resolve(__dirname, `../public/evals/${filename}`));
                                                })
                                                .catch((err) => {
                                                    const setData = {
                                                        companyId: company ? company._id : null,
                                                        companyName: company ? company.name : '',
                                                        userId: users[k] ? users[k].id : null,
                                                        evaluationId: null,
                                                        evaluationName: '',
                                                        userName: tempName ? tempName : '',
                                                        userEmail: users[k] ? users[k].email : '',
                                                        subject: subject,
                                                        message: html,
                                                        emailStatus: "failure",
                                                    }
                                                    emailReport.setEmailReport(setData);
                                                    return new Error(err);
                                                });
                                        })
                                        .catch((err) => {
                                            return new Error(err);
                                        })
                                })
                        }
                    }
                });
            }
        }
    } catch (e) {
        throw new Error(e)
    }
}

exports.sendReportEmail = async function () {
    try {

        // We dont need here cron name thats why passing as test name
        await sendReportEmailWithGDPR('test', null);

        let locations = await findAllGDPREnableLocations();

        if (locations && locations.length > 0) {
            let cronName = 'sendReportEmail';
            for (let i = 0; i < locations.length; i++) {
                let location = await CompanyLocation.findById(locations[i].id);
                if (await checkLocationIsGDPREnable(location.id)) {
                    cronName = 'sendReportEmail'+location.locationName.replace(/ /g, '+');
                    let db = await cronConnectDB(location, cronName);
                    await sendReportEmailWithGDPR(cronName, location);
                    await closeDB(cronName);
                }
            }
        }
    } catch (e) {
        throw new Error(e)
    }
};

async function send7DayAfterFollowupWithGDPR(now, bigNow, cronName, location) {
    try {
        let EvaluationModel = await getSchemaModel(OPTIONS.schemaName.EVALUATIONMODEL, cronName);
        let UserModel = User;
        let evaluationCursor = await EvaluationModel.find({
            followUpSendAt: {
                $lte: now.toDate(),
                $gte: bigNow.toDate()
            },

            feedbackEmailSent: true,
            feedbackCollection: false,
            evaluationProgress: OPTIONS.evaluationProgress.COMPLETED,
            sevenDayAfterFollowupEmailSent: false
        });

        for (let k = 0; k < evaluationCursor.length; k++) {
            UserModel = User;
            await EvaluationModel.findByIdAndUpdate(evaluationCursor[k]._id, { $set: { sevenDayAfterFollowupEmailSent: true } });
            let u;
            let userId = evaluationCursor[k].user;
            let user = {
                email: evaluationCursor[k].email,
                profile: { name: evaluationCursor[k].name }
            };
            if (evaluationCursor[k].individual) {
                userId = evaluationCursor[k].individual;
                u = await UserModel.findById(evaluationCursor[k].individual);
                if (!u) {
                    UserModel = await getSchemaModel(OPTIONS.schemaName.USERMODEL, cronName);
                    u = await UserModel.findById(evaluationCursor[k].individual);
                }
                await UserModel.findByIdAndUpdate(evaluationCursor[k].individual, { $set: { currentStatus: 'Prompt email sent to complete review questionnaire.' } }, function (err) {
                    if (err) {
                        throw new Error(err);
                    }
                });
            }
            if (evaluationCursor[k].company) {
                if (evaluationCursor[k].user) {
                    userId = evaluationCursor[k].user;
                    u = await UserModel.findById(evaluationCursor[k].user);
                    if (!u) {
                        UserModel = await getSchemaModel(OPTIONS.schemaName.USERMODEL, cronName);
                        u = await UserModel.findById(evaluationCursor[k].user);
                    }
                    await UserModel.findByIdAndUpdate(evaluationCursor[k].user, { $set: { currentStatus: 'Prompt email sent to complete review questionnaire.' } }, function (err) {
                        if (err) {
                            throw new Error(err);
                        }
                    });
                }
            }

            if (evaluationCursor[k].consultant) {
                userId = evaluationCursor[k].consultant;
                user = {
                    id: evaluationCursor[k].consultant,
                    profile: {
                        name: evaluationCursor[k].name
                    },
                    email: evaluationCursor[k].email
                };
                u = await UserModel.findById(evaluationCursor[k].consultant);
                if (!u) {
                    UserModel = await getSchemaModel(OPTIONS.schemaName.USERMODEL, cronName);
                    u = await UserModel.findById(evaluationCursor[k].consultant);
                }
                await UserModel.findByIdAndUpdate(evaluationCursor[k].consultant, { $set: { currentStatus: 'Prompt email sent to complete review questionnaire.' } }, function (err) {
                    if (err) {
                        throw new Error(err);
                    }
                });
            }



            let replaceObj = {
                name: evaluationCursor[k].name,
                buttonText: 'Feedback',
                unsubscribeLink: OPTIONS.genAbsoluteUrl('user/unsubscribe/' + userId, 'base'),
                redirectionLink: OPTIONS.genAbsoluteUrl('evaluation/' + evaluationCursor[k].id + '/' + userId + '/feedback/' + (u && u.currentLocation ? u.currentLocation : 'location'), 'site'),
            };
            var emailArray = ['software@fitforworksg.com'];
            let company = await Company.findById(evaluationCursor[k].company);
            let isUnsubscribeTemplate = isUnsubscribeEmailTemplate('FOLLOW_UP_QUESTIONNAIRE_7DAY_EMAIL');
            let userByUserId = u ? await UserModel.findOne({ _id: u.id }) : null;
            let isUserUnsubscribe = (userByUserId != null && userByUserId.isUnsubscribe && userByUserId.isUnsubscribe == true);
            if (!isUnsubscribeTemplate || (isUnsubscribeTemplate && !isUserUnsubscribe)) {
                getHtml.getHtmlFromTemplate(templateEnum.get('FOLLOW_UP_QUESTIONNAIRE_7DAY_EMAIL'), company, replaceObj, location)
                    .then((html) => {
                        getHtml.getHtmlFromSubject(templateEnum.get('FOLLOW_UP_QUESTIONNAIRE_7DAY_EMAIL'), company, replaceObj, location)
                            .then((subject) => {
                                TriggerNotification.triggerEMAIL(evaluationCursor[k].email, emailArray, subject, null, html)
                                    .then(function (info) {
                                        const setData = {
                                            companyId: company ? company._id : null,
                                            companyName: company ? company.name : '',
                                            userId: u ? u.id : null,
                                            evaluationId: evaluationCursor ? evaluationCursor[k]._id : null,
                                            evaluationName: evaluationCursor ? evaluationCursor[k].name : '',
                                            userName: user ? user.profile.name : '',
                                            userEmail: user ? user.email : '',
                                            subject: subject,
                                            message: html,
                                            emailStatus: "success",
                                        }
                                        emailReport.setEmailReport(setData);
                                    })
                                    .catch((err) => {
                                        const setData = {
                                            companyId: company ? company._id : null,
                                            companyName: company ? company.name : '',
                                            userId: u ? u.id : null,
                                            evaluationId: evaluationCursor ? evaluationCursor[k]._id : null,
                                            evaluationName: evaluationCursor ? evaluationCursor[k].name : '',
                                            userName: user ? user.profile.name : '',
                                            userEmail: user ? user.email : '',
                                            subject: subject,
                                            message: html,
                                            emailStatus: "failure",
                                        }
                                        emailReport.setEmailReport(setData);
                                        return new Error(err);
                                    });
                            })
                            .catch((err) => {
                                return new Error(err);
                            })
                    })
            }
            return false;
        }
    } catch (e) {
        throw new Error(e)
    }
}

exports.send7DayAfterFollowup = async function () {
    try {
        let now = moment();
        now = moment().subtract(7, 'days');
        bigNow = moment().subtract(10, 'days');

        // We dont need here cron name thats why passing as test name
        await send7DayAfterFollowupWithGDPR(now, bigNow, 'test', null);

        let locations = await findAllGDPREnableLocations();

        if (locations && locations.length > 0) {
            let cronName = 'send7DayAfterFollowup';
            for (let i = 0; i < locations.length; i++) {
                let location = await CompanyLocation.findById(locations[i].id);
                if (await checkLocationIsGDPREnable(location.id)) {
                    cronName = 'send7DayAfterFollowup'+location.locationName.replace(/ /g, '+');
                    let db = await cronConnectDB(location, cronName);
                    await send7DayAfterFollowupWithGDPR(now, bigNow, cronName, location);
                    await closeDB(cronName);
                }
            }
        }

    } catch (e) {
        throw new Error(e)
    }
};

async function checkEvalCompTwoWeekWithGDPR(now, cronName) {

    let EvaluationModel = await getSchemaModel(OPTIONS.schemaName.EVALUATIONMODEL, cronName);
    let UserModel = User;
    let u = null;

    let evaluationCursor = await EvaluationModel.find({
        updatedAt: {
            $lte: now.toDate()
        },
        evaluationProgress: OPTIONS.evaluationProgress.IN_COMPLETED
    });

    for (let k = 0; k < evaluationCursor.length; k++) {
        let userId = '';
        UserModel = User;
        if (evaluationCursor[k].individual) {
            userId = evaluationCursor[k].individual;
            u = await User.findById(evaluationCursor[k].individual);
            if (!u) {
                UserModel = await getSchemaModel(OPTIONS.schemaName.USERMODEL, cronName);
                u = await UserModel.findById(evaluationCursor[k].individual);
            }
            await UserModel.findByIdAndUpdate(evaluationCursor[k].individual, { $set: { currentStatus: 'Prompt email to complete evaluation sent' } }, function (err) {
                if (err) {
                    throw new Error(err);
                }
            });
        }
        if (evaluationCursor[k].company) {
            if (evaluationCursor[k].user) {
                userId = evaluationCursor[k].user;
                u = await User.findById(evaluationCursor[k].user);
                if (!u) {
                    UserModel = await getSchemaModel(OPTIONS.schemaName.USERMODEL, cronName);
                    u = await UserModel.findById(evaluationCursor[k].user);
                }
                await UserModel.findByIdAndUpdate(evaluationCursor[k].user, { $set: { currentStatus: 'Prompt email to complete evaluation sent' } }, function (err) {
                    if (err) {
                        console.log("LB-1317 error => ",err);
                        throw new Error(err);
                    }
                });
            }
        }
        if (evaluationCursor[k].consultant) {
            userId = evaluationCursor[k].consultant;
            u = await User.findById(evaluationCursor[k].consultant);
            if (!u) {
                UserModel = await getSchemaModel(OPTIONS.schemaName.USERMODEL, cronName);
                u = await UserModel.findById(evaluationCursor[k].consultant);
            }
            await UserModel.findByIdAndUpdate(evaluationCursor[k].consultant, { $set: { currentStatus: 'Prompt email to complete evaluation sent' } }, function (err) {
                if (err) {
                    throw new Error(err);
                }
            });
        }
        let userLog = {};
        userLog.user = userId;
        userLog.evaluation = evaluationCursor[k]._id;
        userLog.action = 'Prompt email to complete evaluation sent';
        userLog.author = 'By System';
        let db = await getDB(cronName);
        if (!db && u && u.currentLocation && await checkLocationIsGDPREnable(u.currentLocation)) {
            let loc = await CompanyLocation.findById(u.currentLocation);
            await cronConnectDB(loc, cronName);
            await UserLog.postLog(userLog, cronName);
            await closeDB();
        } else {
            UserLog.postLog(userLog, cronName);
        }
    }
}

/* check evaluation complete in two week after start and update user status */
exports.checkEvalCompTwoWeek = async function () {
    try {
        let now = moment();
        now = moment().subtract(14, 'days');

        // We dont need here cron name thats why passing as test name
        await checkEvalCompTwoWeekWithGDPR(now, 'test');

        let locations = await findAllGDPREnableLocations();

        if (locations && locations.length > 0) {
            let cronName = 'checkEvalCompTwoWeek';
            for (let i = 0; i < locations.length; i++) {
                let location = await CompanyLocation.findById(locations[i].id);
                if (await checkLocationIsGDPREnable(location.id)) {
                    cronName = 'checkEvalCompTwoWeek'+location.locationName.replace(/ /g, '+');
                    let db = await cronConnectDB(location, cronName);
                    await checkEvalCompTwoWeekWithGDPR(now, cronName);
                    await closeDB(cronName);
                }
            }
        }
    } catch (e) {
        throw new Error(e)
    }
};

async function checkFollowCompTwoWeekWithGDPR(now, cronName) {

    let EvaluationModel = await getSchemaModel(OPTIONS.schemaName.EVALUATIONMODEL, cronName);
    let UserModel = User;
    let u = null;

    let evaluationCursor = await EvaluationModel.find({
        followUpSendAt: {
            $lte: now.toDate()
        },
        mainRating: { $ne: 0 },
        evaluationProgress: OPTIONS.evaluationProgress.COMPLETED,
        feedbackCollection: false
    });

    for (let k = 0; k < evaluationCursor.length; k++) {
        let userId = '';
        UserModel = User;
        if (evaluationCursor[k].individual) {
            userId = evaluationCursor[k].individual;
            u = await User.findById(evaluationCursor[k].individual);
            if (!u) {
                UserModel = await getSchemaModel(OPTIONS.schemaName.USERMODEL, cronName);
                u = await UserModel.findById(evaluationCursor[k].individual);
            }
            await UserModel.findByIdAndUpdate(evaluationCursor[k].individual, { $set: { currentStatus: 'Follow up prompt email sent' } }, function (err) {
                if (err) {
                    throw new Error(err);
                }
            });
        }
        if (evaluationCursor[k].company) {
            if (evaluationCursor[k].user) {
                userId = evaluationCursor[k].user;
                u = await User.findById(evaluationCursor[k].user);
                if (!u) {
                    UserModel = await getSchemaModel(OPTIONS.schemaName.USERMODEL, cronName);
                    u = await UserModel.findById(evaluationCursor[k].user);
                }
                await UserModel.findByIdAndUpdate(evaluationCursor[k].user, { $set: { currentStatus: 'Follow up prompt email sent' } }, function (err) {
                    if (err) {
                        throw new Error(err);
                    }
                });
            }
        }
        if (evaluationCursor[k].consultant) {
            userId = evaluationCursor[k].consultant;
            u = await User.findById(evaluationCursor[k].consultant);
            if (!u) {
                UserModel = await getSchemaModel(OPTIONS.schemaName.USERMODEL, cronName);
                u = await UserModel.findById(evaluationCursor[k].consultant);
            }
            await UserModel.findByIdAndUpdate(evaluationCursor[k].consultant, { $set: { currentStatus: 'Follow up prompt email sent' } }, function (err) {
                if (err) {
                    throw new Error(err);
                }
            });
        }
        let userLog = {};
        userLog.user = userId;
        userLog.evaluation = evaluationCursor[k]._id;
        userLog.action = 'Follow up prompt email sent';
        userLog.author = 'By System';
        let db = await getDB(cronName);
        if (!db && u.currentLocation && await checkLocationIsGDPREnable(u.currentLocation)) {
            let loc = await CompanyLocation.findById(u.currentLocation);
            await cronConnectDB(loc, cronName);
            await UserLog.postLog(userLog, cronName);
            await closeDB();
        } else {
            UserLog.postLog(userLog, cronName);
        }
    }
}

/* check follow up status after two week email send and update user status */
exports.checkFollowCompTwoWeek = async function () {
    try {
        let now = moment();
        now = moment().subtract(14, 'days');

        // We dont need here cron name thats why passing as test name
        await checkFollowCompTwoWeekWithGDPR(now, 'test');

        let locations = await findAllGDPREnableLocations();

        if (locations && locations.length > 0) {
            let cronName = 'checkFollowCompTwoWeek';
            for (let i = 0; i < locations.length; i++) {
                let location = await CompanyLocation.findById(locations[i].id);
                if (await checkLocationIsGDPREnable(location.id)) {
                    cronName = 'checkFollowCompTwoWeek'+location.locationName.replace(/ /g, '+');
                    let db = await cronConnectDB(location, cronName);
                    await checkFollowCompTwoWeekWithGDPR(now, cronName);
                    await closeDB(cronName);
                }
            }
        }
    } catch (e) {
        throw new Error(e)
    }
};

async function sendQcReminderEmailWithGDPR(now, cronName, location) {

    try {
        let EvaluationModel = await getSchemaModel(OPTIONS.schemaName.EVALUATIONMODEL, cronName);
        let evaluationCursor = await EvaluationModel.find({
            QcSendAt: {
                $lte: now.toDate()
            },
            isQc: true,
            evaluationProgress: OPTIONS.evaluationProgress.COMPLETED,
            isQcDone: false
        });

        if (evaluationCursor.length > 0) {
            var emailArray = ['software@fitforworksg.com'];
            var superadmin = '';
            for (let i = 0; i < evaluationCursor.length; i++) {
                User.find({
                    roles: { $in: [OPTIONS.usersRoles.SUPER_ADMIN, OPTIONS.usersRoles.ACCOUNT_MANAGER] },
                    status: OPTIONS.userStatus.ACTIVE
                }).exec(async function (err, users) {
                    if (err) {
                        return reject(new Error('Invalid request'));
                    }
                    if (users && users.length > 0) {
                        for (var k = 0; k < users.length; k++) {
                            if (users[k].roles.includes("SUPER_ADMIN")) {
                                superadmin = users[k].email;
                            }
                            if (users[k].roles.includes("ACCOUNT_MANAGER")) {
                                if (users[k].companiesAccess.length > 0) {
                                    for (var j = 0; j < users[k].companiesAccess.length; j++) {
                                        if (users[k].companiesAccess[j].id == evaluationCursor[i].company) {
                                            let isUnsubscribeTemplate = isUnsubscribeEmailTemplate('EVAL_QC_REMINDER');
                                            let userByUserId = users[k] ? await User.findOne({ _id: users[k].id }) : null;
                                            let isUserUnsubscribe = (userByUserId != null && userByUserId.isUnsubscribe && userByUserId.isUnsubscribe == true);
                                            if (!isUnsubscribeTemplate || (isUnsubscribeTemplate && !isUserUnsubscribe)) {
                                                emailArray.push(users[k].email);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                });
            }
            var newArray = new Set(emailArray);
            emailArray = [...newArray];
            let company = null;
            let emailTemplateReplaceObj = {
                name: '',
            };
            getHtml.getHtmlFromTemplate(templateEnum.get('EVAL_QC_REMINDER'), company, emailTemplateReplaceObj, location)
                .then((html) => {
                    getHtml.getHtmlFromSubject(templateEnum.get('EVAL_QC_REMINDER'), company, emailTemplateReplaceObj, location)
                        .then((subject) => {
                            TriggerNotification.triggerEMAIL(superadmin, emailArray, subject, null, html)
                                .then(function (info) {
                                    return resolve(file);
                                })
                                .catch((err) => {
                                    return new Error(err);
                                });
                        })
                        .catch((err) => {
                            return new Error(err);
                        })
                });
        }
    } catch (e) {
        throw new Error(e)
    }
}

exports.sendQcReminderEmail = async function () {
    try {
        let now = moment();
        now = moment().subtract(2, 'days');

        // We dont need here cron name thats why passing as test name
        await sendQcReminderEmailWithGDPR(now, 'test', null);

        let locations = await findAllGDPREnableLocations();

        if (locations && locations.length > 0) {
            let cronName = 'sendQcReminderEmail';
            for (let i = 0; i < locations.length; i++) {
                let location = await CompanyLocation.findById(locations[i].id);
                if (await checkLocationIsGDPREnable(location.id)) {
                    cronName = 'sendQcReminderEmail'+location.locationName.replace(/ /g, '+');
                    let db = await cronConnectDB(location, cronName);
                    await sendQcReminderEmailWithGDPR(now, cronName, location);
                    await closeDB(cronName);
                }
            }
        }
    } catch (e) {
        throw new Error(e)
    }
};

exports.updateStatusNoResponseToTheFollowupQuestionnaire_NoFurtherAction = async function () {
    try {
        let now = moment();
        let smallDate = moment().subtract(42, "days").startOf('day').startOf('minute').startOf('seconds');
        let bigDate = moment().subtract(42, "days").endOf('day').endOf('minute').endOf('seconds');

        let evaluationCursor = await Evaluation.find({
            followUpSendAt: {
                $gte: smallDate.toDate(),
                $lte: bigDate.toDate()
            },

            feedbackEmailSent: true,
            feedbackCollection: false,
            evaluationProgress: OPTIONS.evaluationProgress.COMPLETED,
            sevenDayAfterFollowupEmailSent: true,
        });
        // console.log("===> now ", smallDate, bigDate, evaluationCursor.length);
        await evaluationCursor.forEach(async (record) => {
            await Evaluation.findByIdAndUpdate(
                record._id,
                {
                $set: {
                    currentStatus:
                    OPTIONS.userCurrentStatus
                        .NO_RESPONSE_TO_THE_FOLLOW_UP_QUESTIONNAIRE_NO_FURTHER_ACTION,
                },
                },
                function (err) {
                if (err) {
                    throw new Error(err);
                }
                }
            );
        });

    } catch (e) {
        throw new Error(e);
    }
};


async function sendAdditional5DayEvalIncompMailWithGDPR(now, cronName, location) {
    try {
        const companies = await Company.find(
          { additionalPromptsApplicable: true },
          { additionalPromptsApplicable: 1, companyUniqueName: 1 }
        );

        if(companies && companies.length > 0){
            let self_additional_eval_email_companies = [];
            companies.map(async (comapny,index) => {
                await self_additional_eval_email_companies.push(
                  mongoose.Types.ObjectId(comapny.id)
                );
            });

            /** Using email template get the locations and finded location evaluation find */
            let getAdditional5DaysCompanyLocation = [];
            let companyTemplates = await CompanyTemplate.find({
              templateName: "SELF_EVALUATION_ADDITIONAL_5_DAY_EMAIL",
              companyId: { $in: self_additional_eval_email_companies },
            });

            companyTemplates.map((record, index) => {
                if (record && record.locationId) {
                    getAdditional5DaysCompanyLocation.push(record.locationId);
                }
            });

            let EvaluationModel = await getSchemaModel(OPTIONS.schemaName.EVALUATIONMODEL, cronName);
            let UserModel = User;
            let evaluationCursor = await EvaluationModel.find({
                updatedAt: {
                    $lte: now.toDate()
                },
                evaluationProgress: OPTIONS.evaluationProgress.IN_COMPLETED,
                fiveDayEmailSent: true,
                additionalFiveDayEvalEmailSent: false,
                company:{ $in : self_additional_eval_email_companies },
                companyLocation:{ $in : getAdditional5DaysCompanyLocation }
            });
            
            for (let k = 0; k < evaluationCursor.length; k++) {
                let userId = evaluationCursor[k].user;
                await EvaluationModel.findByIdAndUpdate(evaluationCursor[k]._id, { $set: { additionalFiveDayEvalEmailSent: true } });
    
                let replaceObj = {
                    name: evaluationCursor[k].name,
                    redirectionLink: OPTIONS.genAbsoluteUrl('login', 'site'),
                    unsubscribeLink: OPTIONS.genAbsoluteUrl('user/unsubscribe/' + userId, 'base'),
                    buttonText: 'Login'
                };
                var emailArray = ['software@fitforworksg.com'];
                UserModel = User;
                if (userId) {
                    let u = await User.findById(userId);
                    if (!u) {
                        UserModel = await getSchemaModel(OPTIONS.schemaName.USERMODEL, cronName);
                    }
                }
                let company = await Company.findById(evaluationCursor[k].company);
                let isUnsubscribeTemplate = isUnsubscribeEmailTemplate('SELF_EVALUATION_ADDITIONAL_5_DAY_EMAIL');
                let userByUserId = userId ? await UserModel.findOne({ _id: userId }) : null;
                let isUserUnsubscribe = (userByUserId != null && userByUserId.isUnsubscribe && userByUserId.isUnsubscribe == true);
                
                /** Find a Location */
                if(evaluationCursor[k].companyLocation){
                    location = await CompanyLocation.findOne({_id: mongoose.Types.ObjectId(evaluationCursor[k].companyLocation)}); 
                }
                
                if (!isUnsubscribeTemplate || (isUnsubscribeTemplate && !isUserUnsubscribe) && location && company) {

                    getHtml.getHtmlFromTemplate(templateEnum.get('SELF_EVALUATION_ADDITIONAL_5_DAY_EMAIL'), company, replaceObj, location)
                    .then((html) => {

                            getHtml.getHtmlFromSubject(templateEnum.get('SELF_EVALUATION_ADDITIONAL_5_DAY_EMAIL'), company, replaceObj, location)
                                .then((subject) => {

                                    TriggerNotification.triggerEMAIL(evaluationCursor[k].email, emailArray, subject, null, html)
                                        .then(function (info) {
                                            const setData = {
                                                companyId: company ? company._id : null,
                                                companyName: company ? company.name : '',
                                                userId: userId ? userId : null,
                                                evaluationId: evaluationCursor ? evaluationCursor[k]._id : null,
                                                evaluationName: evaluationCursor ? evaluationCursor[k].name : '',
                                                userName: evaluationCursor ? evaluationCursor[k].name : '',
                                                userEmail: evaluationCursor ? evaluationCursor[k].email : '',
                                                subject: subject,
                                                message: html,
                                                emailStatus: "success",
                                            }
                                            emailReport.setEmailReport(setData);
                                        })
                                        .catch((err) => {
                                            const setData = {
                                                companyId: company ? company._id : null,
                                                companyName: company ? company.name : '',
                                                userId: userId ? userId : null,
                                                evaluationId: evaluationCursor ? evaluationCursor[k]._id : null,
                                                evaluationName: evaluationCursor ? evaluationCursor[k].name : '',
                                                userName: evaluationCursor ? evaluationCursor[k].name : '',
                                                userEmail: evaluationCursor ? evaluationCursor[k].email : '',
                                                subject: subject,
                                                message: html,
                                                emailStatus: "failure",
                                            }
                                            emailReport.setEmailReport(setData);
                                            return new Error(err);
                                        });
                                })
                                .catch((err) => {
                                    return new Error(err);
                                })
                        })
                }
                //return false;
            }
        }
    } catch (e) {
        throw new Error(e)
    }
}

exports.sendAdditional5DayEvalIncompMail = async function () {
    try {
        let now = moment();
        now = moment().subtract(10, 'days');
        // console.log("sendAdditional5DayEvalIncompMail ",now);

        // We dont need here cron name thats why passing as test name
        let temp = await sendAdditional5DayEvalIncompMailWithGDPR(now, 'test', null);
        let locations = await findAllGDPREnableLocations();

        if (locations && locations.length > 0) {
            let cronName = 'sendAdditional5DayEvalIncompMail';
            for (let i = 0; i < locations.length; i++) {
                let location = await CompanyLocation.findById(locations[i].id);
                if (await checkLocationIsGDPREnable(location.id)) {
                    cronName = 'sendAdditional5DayEvalIncompMail'+location.locationName.replace(/ /g, '+');
                    let db = await cronConnectDB(location, cronName);
                    await sendAdditional5DayEvalIncompMailWithGDPR(now, cronName, location);
                    await closeDB(cronName);
                }
            }
        }
    } catch (e) {
        throw new Error(e)
    }
};
