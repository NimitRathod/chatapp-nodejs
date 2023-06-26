require('apminsight')()
const express = require('express');
const compression = require('compression');
const session = require('express-session');
const bodyParser = require('body-parser');
const logger = require('morgan');
const chalk = require('chalk');
const lusca = require('lusca');
const dotenv = require('dotenv');
const MongoStore = require('connect-mongo')(session);
const flash = require('express-flash');
const path = require('path');
const lodash = require('lodash');
const cors = require('cors');
const mongoose = require('mongoose');
const passport = require('passport');
const expressValidator = require('express-validator');
const Sentry = require('@sentry/node');

dotenv.load({ path: '.env' });

require('./config/passport');

let app = express();
Sentry.init({ dsn: process.env.SENTRY_DSN });
app.use(Sentry.Handlers.requestHandler());

let indexRouter = require('./routes/Index');

app.use(compression());
app.use(cors());

global._ = lodash;

mongoose.set('useCreateIndex', true);
mongoose.set('useFindAndModify', false);
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true });
mongoose.connection.on('error', (err) => {
    console.error(err);
    console.log('%s MongoDB connection error. Please make sure MongoDB is running.', chalk.red('✗'));
    process.exit();
});

app.set('port', process.env.PORT || 3000);
let server = app.listen(app.get('port'), () => {
    console.log('%s App is running at http://localhost:%d in %s mode', chalk.green('✓'), app.get('port'), app.get('env'));
    console.log('  Press CTRL-C to stop\n');
});

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.use(compression());
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb' }));

app.use(expressValidator());
app.use(session({
    resave: true,
    saveUninitialized: true,
    secret: process.env.SESSION_SECRET,
    cookie: { maxAge: null },
    store: new MongoStore({
        url: process.env.MONGODB_URI,
        autoReconnect: true,
    })
}));
app.use(express.static('public'))
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
app.use((req, res, next) => {
    if (req.user) {
        res.locals.user = req.user;
    }
    if (req.path.match(/^\/api/)) {
        next();
    } else {
        next();
    }
});
app.use(lusca.xframe('SAMEORIGIN'));
app.use(lusca.xssProtection(true));
app.disable('x-powered-by');
app.use((req, res, next) => {
    res.locals.user = req.user;
    next();
});

app.use('/', express.static(path.join(__dirname, 'public'), { maxAge: 31557600000 }));

app.use(function (req, res, next) {
    global.HOST_URL = req.protocol + '://' + req.get('host');
    if (process.env.ENVIRONMENT === 'prod') {
        global.HOST_URL = 'https://' + req.get('host');
    }

    console.log("HOST_URL: " + global.HOST_URL);

    return next();
});

process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

app.use('/', indexRouter);

require('./config/cron')();

app.use(Sentry.Handlers.errorHandler({
    shouldHandleError(error) {
        if (error.status === 404 || error.status === 500) {
            return true
        }
        return false
    }
}));

module.exports = app;

