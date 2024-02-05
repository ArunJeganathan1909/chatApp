const express = require('express');
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const bcrypt = require('bcryptjs')
const ws = require('ws')
const fs = require('fs')
const User = require('./models/User');
const Message = require('./models/Message')
const { client } = require('websocket');
const { Console } = require('console');

const app = express()
app.use(express.json())
app.use(cookieParser())
const bcryptSalt = 10; // Define the number of salt rounds
app.use(cors({
    credentials: true,
    origin: 'http://localhost:5173',
}))
// app.use(cors())

app.use('/uploads', express.static(__dirname + '/uploads'))

const PORT = process.env.PORT || 5000;
require('dotenv').config()

mongoose.connect(process.env.MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
        console.log('Connected to MongoDB')
    })
    .catch((error) => {
        console.error('MongoDB connection error:', error);
    })

const jwtSecret = process.env.JWT_SECRET


/*
app.get('/test', (require, response) => {
    response.json('test ok')
}) 
*/

const getUserDataFromRequest = async (request) => {
    return new Promise((resolve, reject) => {
        const token = request.cookies?.token
        if (token) {
            jwt.verify(token, jwtSecret, {}, (error, userData) => {
                if (error) throw error
                resolve(userData)
            })
        } else {
            reject('No token')
        }
    })
}

app.post('/register', async (request, response) => {
    const { username, password } = request.body

    try {
        const hashedPassword = bcrypt.hashSync(password, bcryptSalt);
        const userDoc = await User.create({
            username,
            password: hashedPassword,
        });
        jwt.sign({
            userId: userDoc._id,
            username
        }, jwtSecret, {}, (error, token) => {
            if (error) throw error
            response.cookie('token', token).status(201).json({
                id: userDoc._id,
                username
            })
        })
    } catch (error) {
        response.status(422).json(error)
    }
})

app.post('/login', async (request, response) => {
    const { username, password } = request.body
    const foundUser = await User.findOne({ username })

    if (foundUser) {
        const passOk = bcrypt.compareSync(password, foundUser.password);
        if (passOk) {
            jwt.sign({
                userId: foundUser._id,
                username
            }, jwtSecret, {}, (error, token) => {
                if (error) throw error
                response.cookie('token', token).status(201).json({
                    id: foundUser._id,
                    username
                })
            })
        }
    } else {
        response.status(401).json('Invalid credentials');
    }

})

app.post('/logout', async (request, response) => {
    response.cookie('token', '').status(201).json('ok')
})

app.get('/profile', (request, response) => {
    const token = request.cookies?.token
    if (token) {
        jwt.verify(token, jwtSecret, {}, (error, userData) => {
            if (error) throw error
            const { id, username } = userData
            response.json(userData)
        })
    } else {
        response.status(401).json('no token')
    }
})

app.get('/people', async (request, response) => {
    const users = await User.find({}, { '_id': 1, username: 1 })
    response.json(users)
})

app.get('/messages/:userId', async (request, response) => {
    const { userId } = request.params
    const userData = await getUserDataFromRequest(request)
    const ourUserId = userData.userId
    const messages = await Message.find({
        sender: { $in: [userId, ourUserId] },
        recipient: { $in: [userId, ourUserId] }
    }).sort({ createdAt: 1 })

    response.json(messages)
})

const server = app.listen(PORT, () => {
    console.log(`App is running on port: ${PORT}`);
});

/* const saveFile = async (file) => {
    try {
        const parts = file.name.split('.');
        const ext = parts[parts.length - 1];
        const filename = `${Date.now()}.${ext}`;
        const path = `${__dirname}/uploads/${filename}`;
        const bufferData = Buffer.from(file.data.split(',')[1], 'base64');

        await fs.promises.writeFile(path, bufferData);
        console.log('File saved:', path);
        return filename;
    } catch (error) {
        console.error('Error saving file:', error);
        throw new Error('File saving failed');
    }
}; */

const wss = new ws.WebSocketServer({ server })
wss.on('connection', (connection, request) => {

    const notifyAboutOnlinePeople = () => {
        [...wss.clients].forEach(client => {
            client.send(JSON.stringify({
                online: [...wss.clients].map(c => ({ userId: c.userId, username: c.username }))
            }))
        })
    }

    connection.isAlive = true

    connection.timer = setInterval(() => {
        connection.ping()
        connection.deathTimer = setTimeout(() => {
            connection.isAlive = false
            clearInterval(connection.timer)
            connection.terminate()
            notifyAboutOnlinePeople()
            // console.log('dead')
        }, 1000)
    }, 5000)

    connection.on('pong', () => {
        clearTimeout(connection.deathTimer)
    })


    // Read username and id from the cookie for this connection
    const cookies = request.headers.cookie
    if (cookies) {
        const tokenCookiesString = cookies.split(';').find(str => str.startsWith('token'))
        if (tokenCookiesString) {
            const token = tokenCookiesString.split('=')[1]
            if (token) {
                jwt.verify(token, jwtSecret, {}, (error, userData) => {
                    if (error) throw error
                    const { userId, username } = userData
                    connection.userId = userId
                    connection.username = username
                })
            }
        }
    }

  /*  connection.on('message', async (message) => {

        const messageData = JSON.parse(message.toString());
        const { recipient, text, file } = messageData;
        let filename = null;

        if (file) {
            console.log('size', file.data.length)
            const parts = file.name.split('.')
            const ext = parts[parts.length - 1]
            filename = Date.now() + '.'+ext
            const path = __dirname + '/uploads/' + filename
            const bufferData = new Buffer (file.data.split(',')[1], 'base64')
            fs.writeFile(path, bufferData, () => {
                console.log('file saved:'+ path)
            })

        }

        if (recipient && (text || file)) {
            const messageDoc = await Message.create({
                sender: connection.userId,
                recipient,
                text,
                file: file ? filename : null,
            });

            console.log('created message');

            // Notify the recipient about the new message
            [...wss.clients]
                .filter(c => c.userId === recipient)
                .forEach(c => c.send(JSON.stringify({
                    text,
                    sender: connection.userId,
                    recipient,
                    _id: messageDoc._id,
                    file: file ? filename : null,
                })));
        }

    });*/

    connection.on('message', async (message) => {
        try {
            const messageData = JSON.parse(message.toString());
            const { recipient, text, file } = messageData;
            let filename = null;
    
            if (file) {
                console.log('size', file.data.length);
                const parts = file.name.split('.');
                const ext = parts[parts.length - 1];
                filename = Date.now() + '.' + ext;
                const path = __dirname + '/uploads/' + filename;
                const bufferData = Buffer.from(file.data.split(',')[1], 'base64');
                
                // Save the file asynchronously
                await fs.promises.writeFile(path, bufferData);
                console.log('File saved:', path);
            }
    
            if (recipient && (text || file)) {
                const messageDoc = await Message.create({
                    sender: connection.userId,
                    recipient,
                    text,
                    file: file ? filename : null,
                });
    
                console.log('Created message');
    
                // Notify the recipient about the new message
                [...wss.clients]
                    .filter(c => c.userId === recipient)
                    .forEach(c => c.send(JSON.stringify({
                        text,
                        sender: connection.userId,
                        recipient,
                        _id: messageDoc._id,
                        file: file ? filename : null,
                    })));
            }
        } catch (error) {
            console.error('Error processing message:', error);
            // Handle and respond to errors appropriately
        }
    });
    

    // Noyify everyone about online people (when somwone connects)
    notifyAboutOnlinePeople()

})
