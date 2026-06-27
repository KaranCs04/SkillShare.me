const express = require('express');
const app = express();
const path = require('path');
const passport = require('passport');
const pool=require('./db');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const multer=require('multer');
const http=require('http');
const {Server}=require('socket.io');

const server=http.createServer(app);

const io=new Server(server,{
    cors:{origin:'*'}
});

function getRoomName(userIdA,userIdB){
    const sorted=[userIdA,userIdB].sort((a,b)=>a-b);
    return `chat_${sorted[0]}_${sorted[1]}`;
}

io.on('connection',(socket)=>{
    console.log('User connected',socket.id);
    console.log('A user connected');
    socket.on('disconnect',()=>{
        console.log('A user disconnected');
    });
});




// passport.use(new GoogleStrategy({
//     clientID: process.env.GOOGLE_CLIENT_ID,
//     clientSecret: process.env.GOOGLE_CLIENT_SECRET,
//     callbackURL: 'http://localhost:3000/auth/google/callback'
// },

//     async (accessToke, refreshToken, profile, done) => {
//         try {
//             const email = profile.emails[0].value;
//             const name = profile.displayName;

//             const existing = await pool.query(
//                 'SELECT * FROM users WHERE email=$1', [email]
//             );

//             if (existing.rows.length > 0) {
//                 return done(null, existing.rows[0]);
//             }

//             const newUser = await pool.query(
//                 'INSERT INTO users (email,username,password_hash) VALUES ($1,$2,$3) RETURNING *',
//                 [email, name, 'GOOGLE_OAUTH']
//             );

//             return done(null, newUser.rows[0]);
//         } catch (err) {
//             return done(err, null);
//         }
//     }


// ));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// This is the fix - serve static files from current directory
app.use(express.static(__dirname));

// Simple route that will definitely work
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'chat.html'));
});

// app.get('/following', authenticateJWT, async (req, res) => {
//     try {
//         const userId = req.user.userId;

//         const result = await pool.query(`
//             SELECT u.user_id, u.username, u.profile_pic_url
//             FROM followers f
//             JOIN users u ON u.user_id = f.following_id
//             WHERE f.follower_id = $1
//         `, [userId]);

//         res.json(result.rows);

//     } catch (err) {
//         res.status(500).json({ error: err.message });
//     }
// });

// app.get('/auth/google',
//     passport.authenticate('google', { scope: ['email', 'profile'] })
// );


app.get('/following', authenticateJWT, requireRole('customer', 'admin'), async (req, res) => {
    try {
        const userId = req.user.userId;

        const result = await pool.query(`SELECT u.user_id,u.username FROM followers f
            JOIN users u on u.user_id=f.following_id
            WHERE f.follower_id=$1`,
            [userId]);

        res.json(result.rows);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }

});
server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});