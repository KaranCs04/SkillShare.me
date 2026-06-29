
const express = require('express');
const app = express();
const PORT = 3000;
const pool = require('./db');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const multer = require('multer');
const cloudinary = require('./cloudinary');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const cors = require('cors');
const { resourceUsage } = require('process');
const http = require('http');
const { Server } = require('socket.io');
const server = http.createServer(app);
const onlineUsers = {};

const io = new Server(server, {
    cors: { origin: '*' }
});


app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'Frontend')));

// console.log(path.join(__dirname,'Frontend'));

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
},

    async (accessToke, refreshToken, profile, done) => {
        try {
            const email = profile.emails[0].value;
            const name = profile.displayName;

            const existing = await pool.query(
                'SELECT * FROM users WHERE email=$1', [email]
            );

            console.log(existing.rows[0]);
            console.log('OAuth email from Google:', email);
            console.log('Existing rows:', existing.rows);
            if (existing.rows.length > 0) {
                return done(null, existing.rows[0]);
            }

            const newUser = await pool.query(
                'INSERT INTO users (email,username,password_hash) VALUES ($1,$2,$3) RETURNING *',
                [email, name, 'GOOGLE_OAUTH']
            );

            return done(null, newUser.rows[0]);
        } catch (err) {
            return done(err, null);
        }
    }


));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, result.rows[0]);
});

app.use(passport.initialize());

// Middleware to add JWT
function authenticateJWT(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).json({ error: 'No Token provided' });

    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token tampered' });

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired toekdn' });
        req.user = decoded;
        next();
    });
}

// Middleware to add Role

function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Not Authenticated' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Forbidden:',
                yourRole: req.user.role,
                requireRoles: allowedRoles
            });
        }

        next();
    };

}


// Setting up multer to store image into the memory

const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image should get in'), false);
        }
    }
})


// Middleare to upload to cloudinary
function uploadToCloudinary(fileBuffer) {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'skillshare_posts' },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
        uploadStream.end(fileBuffer);
    });
}

function getRoomName(userIdA, userIdB) {
    const sorted = [userIdA, userIdB].sort((a, b) => a - b);
    return `chat_${sorted[0]}_${sorted[1]}`;
}

io.on('connection', (socket) => {
    console.log('User connected: ', socket.id);

    // Event 1
    socket.on('join-chat', ({ userId, otherUserId }) => {
        const room = getRoomName(userId, otherUserId);
        onlineUsers[userId] = socket.id;
        socket.join(room);
        console.log(`User ${userId} joined room ${room}`);
    });

    // Event 2
    socket.on('send-message', async ({ senderId, senderName, receiverId, content }) => {
        try {
            const result = await pool.query(
                `INSERT INTO messages(senderid,receiverid,content)
                VALUES ($1,$2,$3) RETURNING *`,
                [senderId, receiverId, content]
            );

            const savedMessage = result.rows[0];
            const room = getRoomName(senderId, receiverId);


            io.to(room).emit('receive-message', savedMessage);

            const receiverSocketId = onlineUsers[receiverId];
            console.log('Looking up receiver:', receiverId, '→ found socket:', receiverSocketId);

            if (receiverSocketId) {
                io.to(receiverSocketId).emit('new-notifications', {
                    senderName: senderName, // fetch sender's username from DB and pass it here
                    content: content
                });
            }


        } catch (err) {
            console.log('Message save failed: ', err);
            socket.emit('message-error', { error: 'Message could not be sent' });
        }
    });
    //Event 4
    socket.on('register', (userId) => {
        onlineUsers[userId] = socket.id;
        console.log(`User${userId} registered with socket ${socket.id}`);
    })

    // Event 4
    socket.on('disconnect', () => {
        console.log('User disconnected: ', socket.id);
        for (const [userId, socketId] of Object.entries(onlineUsers)) {
            if (socketId === socket.id) {
                delete onlineUsers[userId];
                break;
            }
        }
    })
})


app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, 'Frontend/Login.html'));
})

app.get('/signUp', (req, res) => {
    res.sendFile(path.join(__dirname, 'Frontend/Signup.html'));
})

app.post('/signup', async (req, res) => {
    try {

        const { username, email, password, description } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });

        }
        // I used the 10 salt rounds
        const passwordHash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users(email,password_hash,bio,username) VALUES ($1,$2,$3,$4) RETURNING user_id,email,username',
            [email, passwordHash, description, username]
        );

        res.status(201).json({ message: 'User created', user: result.rows[0] });

    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Email already in use' });
        }
        res.status(500).json({ error: err.message });
    }


});


app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);

    if (result.rows.length === 0) {
        return
        res.redirect('/SignUp');
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    // This can be changed to show the login page again
    if (!valid) return res.status(401).json({ error: 'Invalid Credentials' });

    const token = jwt.sign(
        { userId: user.user_id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
    // This can be changed into  redirect to the main page or dashboard
    res.json({ token: token, user_id: user.user_id });
});


app.get('/auth/google',
    passport.authenticate('google', { scope: ['email', 'profile'] })
);

app.get('/auth/google/callback',
    passport.authenticate('google', {
        scope: ['email', 'profile'],
        prompt: 'select_account',
        session: false,
        failureRedirect: '/Login'
    }),
    (req, res) => {
        const token = jwt.sign(
            { userId: req.user.user_id, email: req.user.email, role: req.user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        console.log(req.user);

        res.redirect(`/dashboard?token=${token}`);
    }
);

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '/Frontend/dashboard.html'));
})

app.get('/dashboard/feed', authenticateJWT, requireRole('customer', 'admin'), async (req, res) => {
    try {
        const userId = req.user.userId;

        const result = await pool.query(`
            SELECT u.user_id, u.username,p.post_id, p.image_url, p.caption, p.created_at,
            (SELECT COUNT(*) FROM likes WHERE post_id = p.post_id) AS like_count,
        EXISTS(SELECT 1 FROM likes WHERE post_id = p.post_id AND user_id = $1) AS liked_by_me
            FROM post p
            JOIN users u ON u.user_id = p.user_id
            WHERE p.user_id = $1
            OR p.user_id IN (
                SELECT following_id FROM followers WHERE follower_id = $1
            )
            ORDER BY p.created_at DESC
            LIMIT 20
        `, [userId]);

        res.json(result.rows);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



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

app.post('/posts', authenticateJWT, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image provided' });
        }

        const { caption } = req.body;
        const userId = req.user.userId;

        const cloudinaryResult = await uploadToCloudinary(req.file.buffer);

        const imageUrl = cloudinaryResult.secure_url;
        // const cloudinaryPublicId=cloudinaryResult.public_id;
        const result = await pool.query(
            'INSERT INTO post(user_id,image_url,caption) VALUES ($1,$2,$3) RETURNING *',
            [userId, imageUrl, caption]
        );
        res.status(201).json({
            message: 'Post created',
            post: result.rows[0]
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
})

// This is for getting the comments on the post

//<div class="modal-body" id="commentsDisplay">
//  <!--All comments in the desc-->
//</div>

app.get('/posts/:postId/comments', authenticateJWT, requireRole('admin', 'customer'), async (req, res) => {
    
    const postId = req.params.postId;
   

    try {
        const result = await pool.query(
            `SELECT users.username,comments.post_id,comments.user_id,comments.comment_text
             FROM users INNER JOIN comments
             ON users.user_id=comments.user_id
            WHERE post_id=$1`, [postId])

        res.json(result.rows);
    } catch (err) {
        res.status(500).json(err.message);
    }




})

// This is for posting the comment

app.post('/posts/:postId/comment',authenticateJWT,requireRole('customer','admin'),async (req,res)=>{

    const {comment}=req.body;
    const userId=req.user.userId;
    const postId=req.params.postId;
try{
    const result=await pool.query(`
        INSERT INTO comments (user_id,post_id,comment_text)
        VALUES ($1,$2,$3) RETURNING *
        `,[userId,postId,comment]);

     res.status(201).json({
        message:'Comment made',
        comment:result.rows[0]
     })

    }catch(err){
        res.status(500).json(err.message);
    }




})


app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, 'Frontend/profile.html'))
})

app.get('/profile/:user_id', authenticateJWT, requireRole('customer', 'admin'), async (req, res) => {
    const userId = req.params.user_id;
    const result = await pool.query(`
             SELECT 
                u.username,u.avatar_url,u.bio,COUNT(f.following_id) AS following_count
            FROM users u
            LEFT JOIN followers f ON u.user_id=f.follower_id
            WHERE u.user_id=$1
            GROUP BY u.user_id
        `, [userId]);

    if (result.rows.length === 0) {
        return res.status(404).json({ message: 'User not found' });
    }

    res.json(result.rows[0]);


});

app.get('/editProfile', async (req, res) => {
    res.sendFile(path.join(__dirname, 'Frontend/EditProfile.html'));
})


app.patch('/profile/:user_id', authenticateJWT, requireRole('customer', 'admin'), upload.single('image'), async (req, res) => {



    if (req.user.userId !== parseInt(req.params.user_id)) {
        return res.status(403).json({ error: 'You can only edit you own profile' });
    }
    else {
        try {
            const fields = [];
            const values = [];
            const userId = req.params.user_id;

            const bio = req.body.bio;
            if (req.file) {
                const cloudinaryResult = await uploadToCloudinary(req.file.buffer);
                fields.push(`avatar_url=$${fields.length + 1}`);
                values.push(cloudinaryResult.secure_url);
            }
            if (bio) {
                fields.push(`bio=$${fields.length + 1}`);
                values.push(bio);
            }


            values.push(userId);

            const result = await pool.query(`
            UPDATE users
            SET ${fields.join(', ')}
            WHERE user_id = $${values.length}
            RETURNING *
        `, values);

            res.json({ message: 'Profile updated', user: result.rows[0] });


        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }


})



// Backend Route to get the Images of users
app.get('/user/posts/:user_id', authenticateJWT, requireRole('customer', 'admin'), async (req, res) => {

    try {
        const userId = req.params.user_id;
        const result = await pool.query(`
            SELECT post_id,image_url, caption, created_at 
            FROM post 
            WHERE user_id = $1 
            
        `, [userId]);

        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: 'server error' });
    }



});

app.post('/chatbot', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message || message.trim() === '') {
            return res.status(400).json({ error: 'A question is required' });
        }

        const aiResponse = await fetch('https://profound-solace-production-0cae.up.railway.app/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });

        if (!aiResponse.ok) {
            throw new Error('AI service is unavailable');
        }

        const data = await aiResponse.json();
        res.json({ answer: data.answer });

    } catch (err) {
        console.log('Chatbot error: ', err);
        res.status(503).json({ error: 'Chat bot is unavailable' });
    }
})

app.post('/posts/:post_id/like', authenticateJWT, requireRole('customer', 'admin'), async (req, res) => {
    const post_id = req.params.post_id;
    const user_id = req.user.userId;

    try {
        const existing = await pool.query(
            `SELECT *  FROM likes
            WHERE post_id=$1 AND user_id=$2`,
            [post_id, user_id]
        );
        const isLiked = existing.rows.length > 0;

        if (isLiked) {
            await pool.query(`
                DELETE FROM likes WHERE post_id=$1 AND user_id=$2`,
                [post_id, user_id]);
        } else {
            await pool.query(
                `INSERT INTO likes(post_id,user_id) VALUES ($1,$2)`,
                [post_id, user_id]
            );
        }
        const countResult = await pool.query(
            `SELECT COUNT(*) as like_count  FROM likes WHERE post_id=$1`,
            [post_id]
        );
        console.log(countResult.rows[0]);

        res.json({
            like_count: parseInt(countResult.rows[0].like_count)
        });



    } catch (err) {
        console.log('FEED ROUTE ERROR:', err);
        res.status(500).json({ error: err.message });
    }




});

app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'Frontend/chat.html'));
})

app.get('/chat/messages/:friendId', authenticateJWT, requireRole('customer', 'admin'), async (req, res) => {

    const friend_id = req.params.friendId;
    const user_id = req.user.userId;
    try {
        const response = await pool.query(
            `SELECT * FROM messages
        WHERE (senderid=$1 AND  receiverid=$2) or (senderid=$2 AND  receiverid=$1) `,
            [user_id, friend_id]
        );

        res.json(response.rows);

    } catch (err) {
        res.status(500).json({ error: err.message });

    }
});

app.get('/users/search', (req, res) => {
    res.sendFile(path.join(__dirname, 'Frontend/Search.html'));
})

//This is for searching the user
app.get('/api/users/search', authenticateJWT, requireRole('customer', 'admin'), async (req, res) => {
    const username = `%${req.query.q}%`

    try {
        // Getting the user with username
        const result = await pool.query(`
            SELECT * FROM users
            WHERE username ILIKE $1`, [username]);

        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }


});

app.post('/api/follow/:user_id', authenticateJWT, requireRole('customer', 'admin'), async (req, res) => {

    const followerId = req.user.userId;

    const followingId = req.params.user_id;// Getting from the API/Follow/User

    const existing = await pool.query(
        `SELECT * FROM followers WHERE follower_id=$1 AND following_id=$2`,
        [followerId, followingId]
    );
    if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Already following' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO followers(follower_id,following_id) VALUES
            ($1,$2)`, [followerId, followingId]
        );
        res.status(201).json({ message: 'Followed Successfully' });
    } catch (Err) {
        console.log(Err.message);
    }



})


app.get('/db-test', async (req, res) => {
    const result = await pool.query('SELECT NOW()');
    res.json(result.rows[0]);
})

app.delete('/posts/:post_id', authenticateJWT, requireRole('customer', 'admin'), async (req, res) => {
    const post_id = req.params.post_id;

    try {

        const result = await pool.query(
            `SELECT * FROM post WHERE post_id = $1`, [post_id]
        );

        const post = result.rows[0];

        //  - Checking post exists
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }


        if (post.user_id !== req.user.userId) {
            return res.status(403).json({ error: 'You are not authorized' });
        }

        await pool.query(`DELETE FROM post WHERE post_id = $1`, [post_id]);

        res.json({ message: 'Post deleted successfully' });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});







// This gonna check the RBAC authorization
app.delete('/users/:user_id', authenticateJWT, requireRole('admin'), async (req, res) => {
    const userId = req.params.user_id;
    try {
        const response = await pool.query(`
            SELECT * FROM users
            WHERE user_id=$1`, [userId]);

        const isUser = response.rows[0];

        if (response.rows.length > 0) {
            const deleteUser = await pool.query(
                `DELETE FROM users
                WHERE user_id=$1`, [userId]);
        }
    } catch (err) {
        return res.status(203).json({ error: err.message });
    }
    res.json({ message: 'User deleted' });

})

server.listen(PORT, () => {
    console.log(`App is running on http://localhost:${PORT}`);
})