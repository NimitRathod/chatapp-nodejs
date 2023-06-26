const passportJWT = require("passport-jwt");
const ExtractJwt = passportJWT.ExtractJwt;

const jwtOptions = {};
jwtOptions.jwtFromRequest = ExtractJwt.fromAuthHeaderWithScheme("jwt")
jwtOptions.secretOrKey = process.env.JWT_SECRET_KEY;

module.exports = jwtOptions;