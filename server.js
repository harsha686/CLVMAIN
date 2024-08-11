const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { exec } = require('child_process');
const fs = require('fs');
const fsx = require('fs-extra');
const path = require('path');
const os = require('os');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
app.use('/videos', express.static(path.join(__dirname, 'videos')));

const genAI = new GoogleGenerativeAI("AIzaSyDKcwvNlOqufB9--qQnaR3D9dXC7esNil8");
const tempDir = path.join(__dirname, 'temp');
const videosDir = path.join(__dirname, 'videos');
const descriptionFile = path.join(videosDir, 'description.txt');

// Ensure directories exist
const ensureDirectoryExists = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

ensureDirectoryExists(tempDir);
ensureDirectoryExists(videosDir);

// Helper function to delete files with retries
const deleteFile = (filePath, retries = 3) => {
    if (retries === 0) {
        console.error(`Failed to delete file: ${filePath}`);
        return;
    }

    try {
        fs.unlinkSync(filePath);
    } catch (err) {
        if (err.code === 'EPERM' || err.code === 'EBUSY') {
            setTimeout(() => deleteFile(filePath, retries - 1), 500);
        } else {
            throw err;
        }
    }
};

// Clean up old files
const cleanUpOldFiles = () => {
    const oldFiles = ['temp_cpp', 'temp_c'].map(fileName => path.join(tempDir, os.platform() === 'win32' ? `${fileName}.exe` : fileName));
    oldFiles.forEach(filePath => {
        if (fs.existsSync(filePath)) {
            deleteFile(filePath);
        }
    });
};

cleanUpOldFiles();

// Serve static files
app.use(express.static(__dirname));
app.use('/videos', express.static(videosDir));

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('code', async (data) => {
        if (!data || !data.code || !data.language) {
            console.error('Invalid data received:', data);
            socket.emit('output', 'Invalid data received.');
            return;
        }

        const { code, language } = data;
        console.log('Received code:', code, 'Language:', language);
        const fileName = language === 'cpp' ? 'temp.cpp' : 'temp.c';
        const execFileName = language === 'cpp' ? 'temp_cpp' : 'temp_c';
        const filePath = path.join(tempDir, fileName);

        cleanUpOldFiles();

        try {
            await fs.promises.writeFile(filePath, code);
            await fs.promises.access(filePath, fs.constants.F_OK);

            const compileCommand = language === 'cpp' 
                ? `g++ ${filePath} -o ${execFileName}` 
                : `gcc ${filePath} -o ${execFileName}`;

            exec(compileCommand, (compileError, compileStdout, compileStderr) => {
                if (compileError) {
                    socket.emit('output', `Compile Error: ${compileError.message}\n${compileStdout}\n${compileStderr}`);
                    console.log("Compile Error:", compileError.message);
                    return;
                }
                if (compileStderr) {
                    socket.emit('output', `Compile stderr: ${compileStderr}`);
                    console.log("Compile stderr:", compileStderr);
                    return;
                }

                const runCommand = os.platform() === 'win32' ? `${execFileName}.exe` : `./${execFileName}`;

                exec(runCommand, async (runError, runStdout, runStderr) => {
                    if (runError) {
                        socket.emit('output', `Run Error: ${runError.message}`);
                        console.log("Run Error:", runError.message);
                        return;
                    }
                    if (runStderr) {
                        socket.emit('output', `Run stderr: ${runStderr}`);
                        console.log("Run stderr:", runStderr);
                        return;
                    }
                    socket.emit('output', runStdout);
                    console.log("Run stdout:", runStdout);

                    try {
                        const description = await retry(() => generateDescription(code, language));
                        await fs.promises.writeFile(descriptionFile, description + '\n');

                        const textFilePath = path.join(videosDir, 'description.txt');
                        const framesDir = path.join(__dirname, 'frames');
                        const outputVideo = path.join(videosDir, 'text_video.mp4');

                        // Check if video exists and delete it before creating a new one
                        if (fs.existsSync(outputVideo)) {
                            deleteFile(outputVideo);
                        }

                        await createVideoFromText(textFilePath, framesDir, outputVideo);

                        socket.emit('video', path.basename(outputVideo));
                    } catch (error) {
                        console.error('Failed to generate description or video:', error);
                        socket.emit('output', `Error: ${error.message}`);
                    }
                });
            });
        } catch (err) {
            console.error('Error handling file operations:', err);
            socket.emit('output', `Error handling file operations: ${err.message}`);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Retry function
const retry = async (fn, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            console.warn(`Attempt ${i + 1} failed: ${error.message}`);
            if (i === retries - 1) throw error;
        }
    }
};

const generateDescription = async (code, language) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `Explain the following ${language} code in natural language:\n\n${code}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = await response.text();
        //text = text.replace(/[^\w\s.,!?]/g, '');
        return text;
    } catch (error) {
        console.error('Failed to generate description:', error.message);
        throw error;
    }
};

const createVideoFromText = async (textFilePath, framesDir, outputVideo) => {
    try {
        ensureDirectoryExists(framesDir);

        await generateFrames(textFilePath, framesDir);
        await createVideoFromFrames(framesDir, outputVideo);
        console.log('Video created successfully:', outputVideo);
    } catch (err) {
        console.error('Error creating video:', err);
        throw err;
    } finally {
        await fsx.remove(framesDir);
    }
};

const generateFrames = async (textFilePath, framesDir) => {
    await fsx.ensureDir(framesDir);
    const lines = await fsx.readFile(textFilePath, 'utf-8');
    const linesArray = lines.split('\n');
    for (let i = 0; i < linesArray.length; i++) {
        const line = linesArray[i];
        const outputPath = path.join(framesDir, `frame_${String(i).padStart(3, '0')}.png`);
        await createImageFromText(line, outputPath);
    }
};

const createImageFromText = (text, outputPath) => {
    return new Promise((resolve, reject) => {
        const options = {
            font: 'Arial',
            pointsize: 30,
            fill: 'white',
            background: 'black',
            size: '520x320'
        };
        const escapedText = text.replace(/"/g, '\\"');
        const command = `magick convert -background ${options.background} -fill ${options.fill} -font ${options.font} -pointsize ${options.pointsize} -size ${options.size} caption:"${escapedText}" ${outputPath}`;
        exec(command, (err, stdout, stderr) => {
            if (err) reject(err);
            else resolve(stdout);
        });
    });
};

// Create video from frames using FFmpeg
const createVideoFromFrames = (framesDir, outputVideo) => {
    return new Promise((resolve, reject) => {
        exec(`ffmpeg -framerate 1 -i ${path.join(framesDir, 'frame_%03d.png')} -c:v libx264 -r 30 -pix_fmt yuv420p -vf setpts=2.0*PTS ${outputVideo}`, (err, stdout, stderr) => {
            if (err) reject(err);
            else resolve(stdout);
        });
    });
};

server.listen(3001, () => {
    console.log('Server is listening on port 3001 \nhttp://localhost:3001');
});
