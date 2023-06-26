const passport = require('passport');
const { Strategy: LocalStrategy } = require('passport-local');
const passportJWT = require('passport-jwt');
const jwtOptions = require('./jwtOptions');
const Security = require('../models/helpers/Security')
const JwtStrategy = passportJWT.Strategy;
const OPTIONS = require('./options');
const Company = require('../models/Company');
const User = require('../models/User');
const passportSaml = require('passport-saml');
const { getCompanyLocations, isLocationNameExist } = require("../controllers/api/v1/CompanyLocation");
const CompanyLocation = require("../models/CompanyLocation");
const { findUserById, findGDPRLocationByUserid } = require("../common/CommonMethods");
const { checkLocationIsGDPREnable } = require("../common/CheckGDPREnable");
const { connectDB, getSchemaModel, closeDB } = require("../common/ExternalDBConnection");

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  if (user.email) {
    User.findOne({ email: user.email }, (err, user) => {
      done(err, user);
    })
  }
});

/**
 * RESTful APIs JWT Strategy
 */
passport.use(new JwtStrategy(jwtOptions, async (jwt_payload, next) => {
  console.log('payload received - 33', jwt_payload);
  let existingUser = await findUserById(jwt_payload.id);
  let location = await findGDPRLocationByUserid(jwt_payload.id);
  let UserModel = User;
  if (!existingUser && location && await checkLocationIsGDPREnable(location.id)) {
    let db = await connectDB(location);
    UserModel = await getSchemaModel(OPTIONS.schemaName.USERMODEL, null, location);
    existingUser = await findUserById(jwt_payload.id, null, location);
  }

  if (existingUser.status === OPTIONS.userStatus.ACTIVE) {
    if (existingUser.hasRole(OPTIONS.usersRoles.COMPANY_ADMIN) || existingUser.hasRole(OPTIONS.usersRoles.COMPANY_EMPLOYEE)) {
      let company = await Company.findOne({ _id: existingUser.company, status: OPTIONS.companyStatus.ACTIVE });
      if (company) {
        await closeDB(null, jwt_payload.id);
        next(null, existingUser);
      } else {
        await closeDB(null, jwt_payload.id);
        next(null, false);
      }
    } else {
      await closeDB(null, jwt_payload.id);
      next(null, existingUser);
    }
  } else {
    await closeDB(null, jwt_payload.id);
    next(null, false);
  }
}));

const fetchSamlConfig = (req, done) => {
  const companyId = req.params.id;
  Company.findById(companyId, (err, company) => {
    if (err) {
      return done(err);
    }
    const samlConfig = {
      entryPoint: company.ssoEntryPoint,
      issuer: company.ssoIssuer,
      callbackUrl: `${process.env.SSO_CALLBACK_URL}/${companyId}`,
      cert: company.ssoCert,
      disableRequestedAuthnContext: true
    }
    return done(null, samlConfig);
  });
};

// saml strategy for passport
const strategy = new passportSaml.MultiSamlStrategy(
  {
    passReqToCallback: true,
    getSamlOptions(req, done) {
      fetchSamlConfig(req, done);
    },
  },
  (req, profile, done) => {
    /*
    console.log("Recieved SAML payload - 89", profile)
    done(null, profile);
    */

    let companyId = req.params.id;
    /*
    setTimeout(function () {
      console.log("Recieved SAML payload - 97", profile)
      done(null, profile);
    }, 500);
    */
    if (profile?.attributes && profile?.attributes?.locationName) {
      isLocationNameExist(companyId, profile?.attributes?.locationName).then(async (res) => {
        if(!res){
          await createCompanyLocation(companyId, profile?.attributes?.locationName, profile?.attributes?.city);
          console.log("Recieved SAML payload - 106", profile)
          done(null, profile);
        }else{
          console.log("Recieved SAML payload - 109", profile)
          done(null, profile);
        }
      });
    } else {
      console.log("Recieved SAML payload - 114", profile)
      done(null, profile);
    }

    /*
    getCompanyLocations(companyId).then((res) => {      
      if (profile.attributes && profile.attributes.locationName && res && res.length > 0) {
        let isExists = false;
        for (let i = 0; i < res.length; i++) {
          let d = res[i];
          if (d.isDefault && d.isDefault == true) {
            d.isDefault = false;
            let query = {_id: d._id};
            CompanyLocation.findOneAndUpdate(query, d, {upsert: true}, function (err, doc) {
              // if (err) return res.send(500, {error: err});
              // done(null, profile);
            });
          }
        }
        for (let i = 0; i < res.length; i++) {
          let d = res[i];
          if (d.locationName == profile.attributes.locationName) {
            isExists = true;
            d.isDefault = true;
            let query = {_id: d._id};
            console.log(d);
            CompanyLocation.findOneAndUpdate(query, d, {upsert: true}, function(err, doc) {
              // if (err) return res.send(500, {error: err});
              // done(null, profile);
            });
            break;
          }
        }
        if (!isExists) {
          createCompanyLocation(companyId, profile.attributes.locationName, profile.attributes.city);
          // console.log("Recieved SAML payload", profile)
          // done(null, profile);
        } else {
          // console.log("Recieved SAML payload", profile)
          // done(null, profile);
        }
      } else if (profile.attributes && profile.attributes.locationName) {
        createCompanyLocation(companyId, profile.attributes.locationName, profile.attributes.city);
        // console.log("Recieved SAML payload", profile)
        // done(null, profile);
      } else {
        // console.log("Recieved SAML payload", profile)
        // done(null, profile);
      }
    });*/

  },
);

const createCompanyLocation = async (companyId, locationName, city) => {
  let companyLocationData = {
    locationName: locationName,
    floor: null,
    company: companyId,
    building: null,
    city: city || null,
    country: null,
    isDefault: true
  };
  await CompanyLocation.create(companyLocationData).then((res) => {
    console.log(res);
  });
}

passport.use(strategy);

/**
 * Login Required middleware.
 */
exports.isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
};

/**
 * Authorization Required middleware.
 */
exports.isAuthorized = (req, res, next) => {
  const provider = req.path.split('/')
    .slice(-1)[0];
  const token = req.user.tokens.find(token => token.kind === provider);
  if (token) {
    next();
  } else {
    res.redirect(`/ auth / ${provider}`);
  }
};

/**
 * Authorization Required middleware.
 */
exports.isSAAuthorized = function (permission) {
  return function (req, res, next) {
    if (req.user && req.user.isSAGranted(permission)) {
      next();
    } else {
      return res.redirect('/');
    }
  };
};

