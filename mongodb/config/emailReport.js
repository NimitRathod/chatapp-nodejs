const OPTIONS = require('../config/options');
const EmailReport = require('../models/EmailReport');
const resCode = OPTIONS.resCode;

/* Store mail Data in the DB */
exports.setEmailReport = async function (data) {
    try {
        emailReport = new EmailReport();
        emailReport.companyId = data.companyId || null;
        emailReport.companyName = data.companyName || '';
        emailReport.userId = data.userId || null;
        emailReport.evaluationId = data.evaluationId || null;
        emailReport.evaluationName = data.evaluationName || '';
        emailReport.userName = data.userName || '';
        emailReport.userEmail = data.userEmail || '';
        emailReport.subject = data.subject || '';
        emailReport.message = data.message || '';
        emailReport.emailStatus = data.emailStatus || '';
        emailReport.currentDate = Date.now() || '';
        const res = await emailReport.save();
        return res;
        // return res.json(OPTIONS.genRes(resCode.HTTP_OK, emailReport ));

    } catch (e) {
        throw new Error(e)
    }
}; 