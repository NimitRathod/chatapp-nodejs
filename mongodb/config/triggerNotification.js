const nodemailer = require('nodemailer');

exports.triggerEMAIL = (to, cc, subject, text, html, attachments = null) => {
    html = html || '';

    return new Promise((resolve, reject) => {
        let transporter = nodemailer.createTransport({
            host: process.env.MAIL_SMTP_HOST,
            port: process.env.MAIL_SMTP_PORT,
            secure: false,
            secureConnection: false,
            auth: {
                user: process.env.MAIL_SMTP_USERNAME,
                pass: process.env.MAIL_SMTP_PASSWORD
            },
            tls: {
                ciphers: 'SSLv3'
            }
        });

        let mailOptions = {
            from: '"Fit for Work" <' + process.env.MAIL_SMTP_FROM + '>',
            to: to,
            cc: cc,
            subject: subject,
            text: text,
            html: html
        };

        if (process.env.ENVIRONMENT === 'prod') {
            mailOptions['bcc'] = ['software@fitforworksg.com'];
        }

        if (attachments) {
            mailOptions['attachments'] = attachments;
        }
        
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log("transporter.sendMail ===> ",error);
                reject(error);
            }
            resolve(info);
        });
    });
};