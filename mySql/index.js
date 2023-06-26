const cors = require("cors");

const express = require("express");
const app = express();
app.use(cors());

const http = require("http");
const server = http.createServer(app);
express.json();
express.urlencoded({ extended: true });

const { Server } = require("socket.io");

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});

// Let’s make node/socketio listen on port 3000
server.listen(3000, function () {
    // const host = server.address().address
    const host = "192.168.1.53";
    const port = server.address().port;

    console.log("Example app listening at http://%s:%s", host, port);
});

// connect db
var mysql = require("mysql");

// Define our db creds
var db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "laravel_driver2u",
    charset: "utf8mb4",
});

// Log any errors connected to the db
db.connect(function (err) {
    if (err) throw err;
    console.log("Connected!");
});

// Define/initialize our global vars
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html");
});
let m_users_onilne = [];
let OneSignal_APP_ID = "";
let OneSignal_AUTHORIZE = "";
let OneSignal_AUTH_KEY = "";
io.on("connection", (socket) => {
    console.log("a user connected: ", socket.id);
    
    socket.on("user_online", function (data) {
        // saving userId to object with socket ID
        if (data.login_id && data.socket_id ) {
            m_users_onilne = m_users_onilne.filter(e => e.login_id != data.login_id);
            m_users_onilne.push(data);
            io.emit("online_users_list", m_users_onilne);
            console.log("online_users_list_66", m_users_onilne);
        }
    });

    socket.on("chat_message", (message) => {
        try {
            let date = new Date();
            let _date = date;
            date = date.toISOString().slice(0, 19).replace("T", " ");
            // console.log("date: ", date, typeof date);
            // if(isset(message.message_type) && !empty(message.message_type)) { message.message_type }else{ message.message_type = 'text'; }

            let queryInsert =
                "INSERT INTO chat_messages (booking_id,sender_id,reciver_id,message, attechment_name, attechment_extension, attechment_mime_type,message_type,message_status,created_at) VALUES ('" +
                message.booking_id +
                "','" +
                message.sender_id +
                "','" +
                message.reciver_id +
                "','" +
                message.message +
                "', '" +
                message.attechment_name +
                "', '" +
                message.attechment_extension +
                "', '" +
                message.attechment_mime_type +
                "', '" +
                message.message_type +
                "','unread','" +
                date +
                "')";

            db.query(queryInsert, function (err, result) {
                if (err) throw err;
                // console.log("Message store successfully");

                let queryUpdateLastSeen =
                    "UPDATE chat_connected_users SET updated_at='" +
                    date +
                    "' WHERE booking_id='" +
                    message.booking_id +
                    "' AND ((sender_id='" +
                    message.reciver_id +
                    "' AND reciver_id='" +
                    message.sender_id +
                    "') OR (sender_id='" +
                    message.sender_id +
                    "' AND reciver_id='" +
                    message.reciver_id +
                    "'))";

                db.query(queryUpdateLastSeen, function (err, result) {
                    if (err) throw err;
                    // console.log("Message last seend update");
                });
                // console.log(queryUpdateLastSeen);
            });
            message.created_at = _date;
            message.redirect = "chat";
            const key =
                "sendto_" + message.reciver_id + "_" + message.booking_id;

            let querySelectOneSignal =
                "SELECT * FROM `business_settings` WHERE `key` = 'one_signal' ORDER BY id DESC";
            db.query(querySelectOneSignal, function (err, resultOneSignal) {
                if (err) throw err;
                if (
                    resultOneSignal.length > 0 &&
                    typeof resultOneSignal[0] !== undefined
                ) {
                    resultOneSignal = resultOneSignal[0];
                    if (resultOneSignal.value !== undefined) {
                        resultOneSignal = JSON.parse(resultOneSignal.value);
                        if (
                            resultOneSignal.app_id !== undefined &&
                            resultOneSignal.app_id !== "" &&
                            resultOneSignal.authorize !== undefined &&
                            resultOneSignal.authorize !== "" &&
                            resultOneSignal.auth_key !== undefined &&
                            resultOneSignal.auth_key !== ""
                        ) {
                            OneSignal_APP_ID = resultOneSignal.app_id;
                            OneSignal_AUTHORIZE = resultOneSignal.authorize;
                            OneSignal_AUTH_KEY = resultOneSignal.auth_key;
                            // console.log('Line 147 ',OneSignal_APP_ID,OneSignal_AUTHORIZE,OneSignal_AUTH_KEY);
                            /** Notification Send */
                            let querySelectUserDeviceToken =
                                "SELECT id,devicetoken,customer_devicetoken FROM `users` WHERE id = '" +
                                message.reciver_id +
                                "'";
                            let notification_user_ids = [];
                            let push_notification_message = {
                                // app_id: "7698d72a-4106-440c-ac35-1bb8e52ac593",
                                app_id: OneSignal_APP_ID,
                                contents: {
                                    en:
                                        message.message === ""
                                            ? message.message_type
                                            : message.message,
                                },
                                // included_segments: ["Active Users"],
                                // included_segments: ["Subscribed Users"],
                                included_segments: [""],
                                include_player_ids: [],
                                headings: {
                                    en: "Message from " + message.sender_name,
                                },
                                title: "Message from " + message.sender_name,
                            };
                            // push_notification_message.redirect = "chat";
                            db.query(
                                querySelectUserDeviceToken,
                                function (err, result) {
                                    if (err) throw err;
                                    if (
                                        result.length > 0 &&
                                        typeof result[0] !== undefined
                                    ) {
                                        result = result[0];

                                        push_notification_message.title =
                                            "Message from " + message.sender_name;
                                        message.title = "Message from " + message.sender_name;
                                        push_notification_message.data =
                                            message;
                                        if (
                                            message.from === "customer" &&
                                            result.devicetoken !== null
                                        ) {
                                            notification_user_ids =
                                                result.devicetoken.split(",");
                                            // notification_user_ids.push(result.devicetoken);
                                            push_notification_message.include_player_ids =
                                                notification_user_ids;
                                            sendNotification(
                                                push_notification_message
                                            );
                                        }
                                        if (
                                            message.from === "driver" &&
                                            result.customer_devicetoken !== null
                                        ) {
                                            notification_user_ids =
                                                result.customer_devicetoken.split(",");
                                            // notification_user_ids.push(result.customer_devicetoken);
                                            push_notification_message.include_player_ids =
                                                notification_user_ids;
                                            sendNotification(
                                                push_notification_message
                                            );
                                        }
                                        console.log(
                                            "Get the User Detail 158 => ",
                                            result,
                                            notification_user_ids,
                                            push_notification_message
                                        );
                                    }
                                    // console.log(
                                    //     "Get the User Detail 150 => ",
                                    //     result.length,
                                    //     (result.length > 0),
                                    //     (typeof result[0] !== undefined),
                                    // );
                                }
                            );
                        }
                    }
                }
            });
            io.emit(key, message);
            console.log(message);
            // console.log('sendto => '+key);
        } catch (err) {
            console.log("chat_message try_catch" + err);
            // if any error, Code throws the error
        }
    });

    /**
    * This method read receipts for the device login user to oppsite user like reciver user
    */
    socket.on("read_receipts", (message) => {
        let queryInsert =
            "UPDATE chat_messages SET message_status='read' WHERE booking_id='" +
            message.booking_id +
            "' AND sender_id='" +
            message.reciver_id +
            "' AND reciver_id='" +
            message.sender_id +
            "'";
        db.query(queryInsert, function (err, result) {
            if (err) throw err;
            console.log("Read Receipts successfully");
        });
        const key =
            "read_receipt_to_" + message.reciver_id + "_" + message.booking_id;
        console.log(message);
        console.log("read_receipt_to => " + key);
        io.emit(key, message);
    });

    socket.on("disconnect", async () => {
        // console.log("user disconnected: ", socket.id);
        const newUser = m_users_onilne.filter(
            (obj) => obj.socket_id !== socket.id
        );
        m_users_onilne = newUser;
        io.emit("online_users_list", m_users_onilne);
        console.log("online_users_list_158 ", m_users_onilne);
    });
});

var sendNotification = function (data) {
    console.log("Line 279", data, OneSignal_AUTHORIZE);

    try {
        var headers = {
            "Content-Type": "application/json; charset=utf-8",
            Authorization: "Basic " + OneSignal_AUTHORIZE,
        };
        var options = {
            host: "onesignal.com",
            port: 443,
            path: "/api/v1/notifications",
            method: "POST",
            headers: headers,
        };

        var https = require("https");
        var req = https.request(options, function (res) {
            res.on("data", function (data) {
                console.log("OneSignal Response:");
                console.log(JSON.parse(data));
            });
        });
        req.on("error", function (e) {
            console.log("OneSignal ERROR:");
            console.log(e);
        });

        req.write(JSON.stringify(data));
        // console.log("Line 255", req);
        req.end();
    } catch (error) {
        console.log("OneSignal Catch 245" + error);
    }
};
