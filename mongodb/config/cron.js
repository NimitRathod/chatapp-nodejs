const schedule = require('node-schedule');

exports = module.exports = function () {
    const cronController = require('./cronController');

    /**
     * Every 12 hrs
     */
    schedule.scheduleJob('0 0 12 * * *', async function () {
        await cronController.sendFollowUpEmail();
        await cronController.sendIndividualFollowUpEmail();
        await cronController.sendQcReminderEmail();
        await cronController.checkFollowCompTwoWeek();
        await cronController.archiveEvaluations();
        await cronController.checkEvalCompTwoWeek();
    });

    /**
     * Every 13 hrs
     */
    schedule.scheduleJob('0 0 13 * * *', async function () {
        await cronController.send5DayEvalIncompMail();
        await cronController.sendAdditional5DayEvalIncompMail();
        await cronController.send7DayAfterFollowup();
    });

    /**
     * Every 1 minutes
     */
    schedule.scheduleJob('*/1 * * * *', async function () {
        if (process.env.ENVIRONMENT !== 'prod') {
            await cronController.send5DayEvalIncompMail();
            await cronController.sendFollowUpEmail();
            await cronController.sendIndividualFollowUpEmail();
            await cronController.send7DayAfterFollowup();
            await cronController.checkEvalCompTwoWeek();
            // await cronController.checkFollowCompTwoWeek();
            // await cronController.checkPasswordExpiry();
            // Every 24  hours
            // await cronController.sendDataDeleteNotify();
            // await cronController.sendReportEmail();
            // await cronController.sendQcReminderEmail();
        }
        /** After 6 week not respone of the followup change the status */
        await cronController.updateStatusNoResponseToTheFollowupQuestionnaire_NoFurtherAction();

        /** Below Cron run every 1 minutes if you can change the time move this funcation to any schedular */
        await cronController.sendAdditional5DayEvalIncompMail();

    });

    /**
     * schedule a job everyday at 12:05 AM
     */
    schedule.scheduleJob('0 5 12 * * *', async function () {
        await cronController.sendDataDeleteNotify();
        await cronController.checkPasswordExpiry();
    });

    /**
     * schedule a job every Monday 12:00 AM
     */
    schedule.scheduleJob('0 0 * * MON', async function () {
        await cronController.sendReportEmail();
    });

};
