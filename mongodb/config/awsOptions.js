let options = {
    AWS_ACCESS_KEY: process.env.AWS_ACCESS_KEY,
    AWS_SECRET_KEY: process.env.AWS_SECRET_KEY,
    AWS_S3_BUCKET: process.env.AWS_INPUT_BUCKET,
    s3ApiVersion: '2012–09–25',
    etApiVersion: "2012–09–25",
    s3Region: process.env.AWS_S3_REGION,

    generateCloudFrontUrl: function (filePath, baseURL) {
        if (filePath) {
            let filePathUrl = 'https://' + process.env.AWS_CLOUDFRONT_WEB_DOMAIN_NAME + '/' + filePath;
            return filePathUrl;
        } else if (baseURL) {
            return 'https://' + process.env.AWS_CLOUDFRONT_WEB_DOMAIN_NAME + '/';
        } else {
            return '';
        }
    },
};
module.exports = options;
