const _ = require('lodash');
const pug = require('pug');
const moment = require('moment');
const AWS_Options = require('./awsOptions');

const options = {
    appVersion: '0.0.1',
    dashboardTimezone: 'Asia/Singapore',
    perFormCost: 25,
    maxLimit: 999999,
    companyMinOnlinePaymentSize: 5,
    evaluationFeedbackAfter: 14 * 24,
    evaluationArchive: 20 * 30,
    allowedAccessWithoutEmailVerifiedForHours: 5 * 24,
    sendEmailVerifiedEveryHours: 24 * 30,
    resetPasswordExpireInDays: 720,
    loginSessionInMilliseconds: 30 * 24 * 60 * 60 * 1000,
    contactEmail: 'hello@fitforworksg.com',
    permissionMatrix: {
        user: {
            label: 'User',
            value: 'user',
            roles: ['SUPER_ADMIN', 'ADMIN']
        },
        getAdminPermissions: function () {
            return [
                options.permissionMatrix.user
            ];
        },
        getLabel: function (permission) {
            return options.permissionMatrix[permission];
        }
    },
    eventStatus: {
        EVALUATIONCREATE: 'evaluation create',
        EVALUATIONCOMPLETE: 'evaluation complete',
        COMPANYREGISTER: 'company register',
        LOGINFAILED: 'login - failed',
        LOGINSUCCESS: 'login - success',
        FOLLOWUPCOMPLETE: 'follow up - complete',
        COMPANYEMPLOYEEREGISTER: 'company employee register',
        USERREGISTER: 'user register',
        USERCREATEBYSUPERADMIN: 'user create by superadmin',
        ACCOUNTMANAGERCREATEBYSUPERADMIN: 'account manager create by superadmin',
        CONSULTANTCREATEBYSUPERADMIN: 'consultant create by superadmin',
        EMPLOYEEPROFILEVIEWED: 'Employee Profile viewed',
        LOGOUTSUCCESS: 'logout - success',
        EDUCATION_COMPANY_EMPLOYEE_REGISTER: 'Education company employee register',
    },
    schemaName: {
        USERMODEL: 'UserModel',
        EVENTMODEL: 'EventModel',
        EVALUATIONMODEL: 'EvaluationModel',
        EVALUATIONQUESTIONMODEL: 'EvaluationQuestionModel',
        USERLOGMODEL: 'UserLogModel',
        EVALUATIONFEEDBACKMODEL: 'EvaluationFeedbackModel',
        TASKMODEL: 'TaskModel',
        EMAILREPORTSMODEL: 'EmailReportsModel'
    },
    taskStatus: {
        ACTIVE: 'active',
        ARCHIVE: 'archive',
        DELETED: 'deleted'
    },
    sectionStatus: {
        ACTIVE: 'active',
        ARCHIVE: 'archive',
        DELETED: 'deleted'
    },
    userStatus: {
        ACTIVE: 'active',
        INACTIVE: 'inactive',
        BLOCKED: 'blocked',
        DELETED: 'deleted'
    },
    formStatus: {
        ACTIVE: 'active',
        ARCHIVE: 'archive',
        DELETED: 'deleted'
    },
    companyLocationStatus: {
        ACTIVE: 'active',
        ARCHIVE: 'archive',
        DELETED: 'deleted'
    },
    companyStatus: {
        ACTIVE: 'active',
        DELETED: 'deleted',
        INACTIVE: 'inactive',
    },
    educationResourcesStatus: {
        ACTIVE: 'active',
        DELETED: 'deleted',
        INACTIVE: 'inactive',
    },
    formQuestionsStatus: {
        ACTIVE: 'active',
        ARCHIVE: 'archive',
        DELETED: 'deleted'
    },
    evaluationStatus: {
        ACTIVE: 'active',
        ARCHIVE: 'archive',
        DELETED: 'deleted'
    },
    evaluationEquipmentStatus: {
        TASKRECOMMENDEDNOTAPPROVED: 'Task recommended. Not Approved',
        TASKRECOMMENDEDAPPROVEDTOORDER: 'Task recommended. Approved to order',
        EQUIPMENTORDER: 'Equipment Order',
        PENDINGFURTHERAPPROVAL: 'Pending further approval',
        PENDINGFURTHERDETAILS: 'Pending further details',
        AWAITINGDELIVERY: 'Awaiting delivery',
        ITEMDELIVEREDAWAITINGREVIEW: 'Item delivered. Awaiting review',
        ITEMINSITUNOFURTHERACTION: 'Item in situ. No further action',
        NOTREQUIRED: 'Not required'
    },
    evaluationProgress: {
        NEW: 'new',
        COMPLETED: 'completed',
        IN_COMPLETED: 'in_completed'
    },
    orderStatus: {
        NEW: 'new',
        SUCCESS: 'success',
        FAILED: 'failed'
    },
    formQuestionInputType: {
        SINGLE_SELECT: 'single_select',
        MULTI_SELECT: 'multi_select',
        IMAGE_UPLOAD: 'image_upload',
        IMAGE_SELECT: 'image_select',
        TEXT: 'text',
    },
    formType: {
        COMPANY: 'company',
        CONSULTANT: 'consultant',
        INDIVIDUAL: 'individual'
    },
    usersRoles: {
        SUPER_ADMIN: 'SUPER_ADMIN', // from all database(master + all companies location based db)
        COMPANY_ADMIN: 'COMPANY_ADMIN', //master + location based db + his data
        COMPANY_EMPLOYEE: 'COMPANY_EMPLOYEE', //location based db , sometime from master
        COMPANY: 'COMPANY', // master db
        CONSULTANT: 'CONSULTANT', //master db
        INDIVIDUAL: 'INDIVIDUAL', //location based db, master db
        ACCOUNT_MANAGER: 'ACCOUNT_MANAGER', // same as company admin
        SCHEDULER: 'SCHEDULER', // master + location based db
        EDUCATION_COMPANY: 'EDUCATION_COMPANY', // master
        EDUCATION_EMPLOYEE: 'EDUCATION_EMPLOYEE', // master
        getAllRolesAsArray: function () {
            return [
                options.usersRoles.SUPER_ADMIN,
                options.usersRoles.COMPANY_ADMIN,
                options.usersRoles.COMPANY_EMPLOYEE,
                options.usersRoles.CONSULTANT,
                options.usersRoles.INDIVIDUAL,
                options.usersRoles.COMPANY,
                options.usersRoles.SCHEDULER,
                options.usersRoles.EDUCATION_EMPLOYEE,
            ];
        },
    },
    userCurrentStatus: {
        "SELF_ASSESSMENT_COMPLETED_AWAITNING_REVIEW": "self-assessment completed. Awaiting review.",
        "PROMPT_EMAIL_SENT_TO_COMPLETE_REVIEW_QUESTIONNAIRE": "Prompt email sent to complete review questionnaire.",
        "NO_RESPONSE_TO_THE_FOLLOW_UP_QUESTIONNAIRE_NO_FURTHER_ACTION": "No response to the follow-up questionnaire. No further action",
    },
    genders: {
        MALE: 'Male',
        FEMALE: 'Female',
        TRANSGENDER: 'Transgender',
    },
    resCode: {
        HTTP_OK: 200,
        HTTP_CREATE: 201,
        HTTP_NO_CONTENT: 204,
        HTTP_BAD_REQUEST: 400,
        HTTP_UNAUTHORIZED: 401,
        HTTP_FORBIDDEN: 403,
        HTTP_NOT_FOUND: 404,
        HTTP_METHOD_NOT_ALLOWED: 405,
        HTTP_CONFLICT: 409,
        HTTP_INTERNAL_SERVER_ERROR: 500,
        HTTP_SERVICE_UNAVAILABLE: 503
    },
    errorTypes: {
        OAUTH_EXCEPTION: 'OAuthException',
        ALREADY_AUTHENTICATED: 'AlreadyAuthenticated',
        UNAUTHORISED_ACCESS: 'UnauthorisedAccess',
        INPUT_VALIDATION: 'InputValidationException',
        ACCOUNT_ALREADY_EXIST: 'AccountAlreadyExistException',
        ACCOUNT_DOES_NOT_EXIST: 'AccountDoesNotExistException',
        ENTITY_NOT_FOUND: 'EntityNotFound',
        ACCOUNT_BLOCKED: 'AccountBlocked',
        ACCOUNT_DEACTIVATED: 'AccountDeactivated',
        CONTENT_BLOCKED: 'ContentBlocked',
        CONTENT_REMOVED: 'ContentRemoved',
        PRIVATE_CONTENT: 'PrivateContent',
        PRIVATE_ACCOUNT: 'PrivateAccount',
        DUPLICATE_REQUEST: 'DuplicateRequest',
        EMAIL_NOT_VERIFIED: 'emailNotVerified',
        MOBILE_NUMBER_NOT_VERIFIED: 'mobileNumberNotVerified',
        INTERNAL_SERVER_ERROR: 'InternalServerError',
        COMPANY_TEMPLATE_ERROR: 'CompanyTemplateError'
    },
    emailVerificationExpireInDays: 720,
    isValidId: (id) => {
        return (id && id.match(/^[0-9a-fA-F]{24}$/));
    },
    genOtp: () => {
        return Math.floor(1000 + Math.random() * 9000);
    },
    genRes: (code, payload, type, noWrapPayload) => {

        noWrapPayload = noWrapPayload || false;
        type = type || 'unknown';

        if (code && code >= 300) {
            payload = _.isArray(payload) ? payload : [payload];
            var plain_text_errors = (payload.length > 0 && _.isString(payload[0])) ? payload : [];
            var object_errors = (payload.length > 0 && _.isObject(payload[0])) ? payload : [];
            var output = {
                'error': {
                    'errors': plain_text_errors,
                    'error_params': object_errors,
                    'code': code,
                    'type': type
                }
            };
            return output;
        } else {
            // success data
            if (payload && !noWrapPayload) {
                return { result: payload };
            } else if (payload) {
                return payload;
            } else {
                return undefined;
            }
        }
    },
    genAbsoluteUrl: (path, type, opt) => {
        var url = process.env.MAIN_DOMAIN.replace(/^(?:https?:\/\/)?(?:http?:\/\/)?/i, "").split('/')[0];
        switch (type) {
            case 'site':
                return process.env.MAIN_DOMAIN + path;
            case 'root':
                return HOST_URL + process.env.ROOT_BASE_PATH + path;
            case 'superAdmin':
                return HOST_URL + process.env.SUPER_ADMIN_BASE_PATH + path;
            case 'base':
                return process.env.MAIN_DOMAIN + process.env.API_BASE_PATH + path;
            default:
                return HOST_URL + path;
        }

    },
    genHtml: (template, data) => {
        return pug.renderFile(__dirname + '/../email_templates/' + template + '.pug', data);
    },
    prepareSearchString: (term) => {
        return decodeURIComponent(term).replace(/[.*+?^${}()|"'[\]\\]/, '\\$&');
    },
    genReportHtml: (template, data) => {
        return pug.renderFile(__dirname + '/../report_templates/' + template + '.pug', data);
    },
    generateCloudFrontUrl: AWS_Options.generateCloudFrontUrl,
    educationQuizQuestionsStatus: {
        ACTIVE: 'active',
        ARCHIVE: 'archive',
        DELETED: 'deleted'
    },
    educationQuizQuestionsInputType: {
        SINGLE_SELECT: 'single_select',
        MULTI_SELECT: 'multi_select',
        IMAGE_UPLOAD: 'image_upload',
        IMAGE_SELECT: 'image_select',
        TEXT: 'text',
    },
    educationQuizProgress: {
        NEW: 'new',
        COMPLETED: 'completed',
        IN_COMPLETED: 'in_completed'
    },
    evaluationWorkStations: {
        HOME_WORK_STATION: 'Home Workstation',
        OFFICE_WORK_STATION: 'Office Workstation',
        OTHER_WORK_STATION: 'Other Workstation',
    },
    equipmentStatus: {
        ACTIVE: 'active',
        ARCHIVE: 'archive',
        DELETED: 'deleted'
    },
    CommonStatus: {
        ACTIVE: 'active',
        ARCHIVE: 'archive',
        DELETED: 'deleted'
    },
    equipmentTaskStatus: {
        Task_Recommended_Waiting_For_approval: 'Task recommended. Waiting for approval',
        Task_Manually_Recommended_Waiting_For_Approval: 'Task manually recommended. Waiting for approval',
        Task_Recommended_Not_Approved: 'Task recommended. Not Approved',
        Task_Recommended_Approved_To_Order: 'Task recommended. Approved to order',
        Equipment_Order: 'Equipment Order',
        Pending_Further_Approval: 'Pending further approval',
        Pending_Further_Details: 'Pending further details',
        Awaiting_Delivery: 'Awaiting delivery',
        Item_Delivered_Awaiting_Review: 'Item delivered. Awaiting review',
        Item_In_Situ_No_Further_Action: ' Item in situ. No further action',
        Not_Required: 'Not required',
        Item_Not_Required: 'Item not required', // Automatically move in this when select any similar equipment
        getAllEquipmentTaskStatusAsArray: function () {
            return [
                options.equipmentTaskStatus.Task_Recommended_Waiting_For_approval,
                options.equipmentTaskStatus.Task_Manually_Recommended_Waiting_For_Approval,
                options.equipmentTaskStatus.Task_Recommended_Not_Approved,
                options.equipmentTaskStatus.Task_Recommended_Approved_To_Order,
                options.equipmentTaskStatus.Equipment_Order,
                options.equipmentTaskStatus.Pending_Further_Approval,
                options.equipmentTaskStatus.Pending_Further_Details,
                options.equipmentTaskStatus.Awaiting_Delivery,
                options.equipmentTaskStatus.Item_Delivered_Awaiting_Review,
                options.equipmentTaskStatus.Item_In_Situ_No_Further_Action,
                options.equipmentTaskStatus.Not_Required,
                options.equipmentTaskStatus.Item_Not_Required,
            ];
        },
    },
    educationResourceLanguages: {
        ENGLISH: "English",
        MANADARIN: "Mandarin",
        TAGALOG: "Tagalog",
        VIETNAMESE: "Vietnamese",
        BAHASA_INDONESIA: "Bahasa Indonesia",
        BAHASA_MALAYSIA: "Bahasa Malaysia",
        THAI: "Thai",
        FRENCH: "French",
        SPANISH: "Spanish",
        PORTUGUESE: "Portuguese",
        GERMAN: "German",
        ARABIC: "Arabic",
        ITALIAN: "Italian",
        DUTCH: "Dutch",
        DANISH: "Danish",
        SWEDISH: "Swedish",
    },
    educationResourceSections: {
        WOEKING_FROM_HOME : "Working from Home",
        HEALTH_AND_SAFETY : "Health and Safety",
        PRODUCTIVITY : "Productivity",
        STRESS_MANAGEMENT : "Stress Management",
        ERGONOMICS : "Ergonomics",
        WELLBEING : "Wellbeing",

    }
};
module.exports = options;
