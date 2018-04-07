const log4js = require('log4js');
const fs = require('fs');
const ffmpeg = require('ffmpeg');
const compareImages = require('resemblejs/compareImages');
const util = require('util');
const jimp = require('jimp');
const rmdir = require('rmdir');
const natsort = require('natsort');

const VIDEOS_DIR = './videos';
const CYCLE_DURATION = 10;
const EMPTY_FRAME = './empty.png';

log4js.configure({
    appenders: {
        cheese: {
            type: 'file',
            filename: 'log.txt'
        },
        console: {
            type: 'console'
        }
    },
    categories: {
        default: {
            appenders: ['cheese', 'console'],
            level: 'all'
        }
    }
});

const logger = log4js.getLogger();
const deleteFile = util.promisify(fs.unlink);
const readFile = util.promisify(fs.readFile);

async function getDiff(img1, img2) {

    logger.info(`Comparing ${img1} and ${img2}`);

    const options = {
        outputDiff: false
    };

    return await compareImages(
        await readFile(img1),
        await readFile(img2),
        options
    );
}

async function prepareFiles() {

    try {

        logger.info('Preparing directory...');

        const readdir = util.promisify(fs.readdir);
        const deleteDir = util.promisify(rmdir);
        let files = await readdir(VIDEOS_DIR);
        let filteredFiles = [];

        for (file of files) {

            // deleting all files that are not videos        
            if (file.search(/gitkeep/) >= 0) {
                continue;
            } else if (file.search(/_temp/i) >= 0) {
                rmdir(`${VIDEOS_DIR}/${file}`, function (err) {
                    if (!err) {
                        logger.info(`Folder ${file} was removed!`);
                    } else {
                        logger.error(err);
                    }
                });
                continue;
            }

            // renaming all files that contains spaces
            if ((file.search(/_temp/) === -1) && (file.search(/\s+/g) >= 0)) {
                const oldName = file;
                file = file.replace(/\s+/g, '-');
                logger.info(`New name of ${oldName} is`, file);
                fs.renameSync(`${VIDEOS_DIR}/${oldName}`, `${VIDEOS_DIR}/${file}`);

                filteredFiles.push(file);
                continue;
            }

            filteredFiles.push(file);
        }

        return filteredFiles;
    } catch (error) {
        logger.error(error);
    }

}

// getting all videos in directory
async function readVideos() {
    try {
        logger.info(`Reading files from "${VIDEOS_DIR}"...`);

        const files = await prepareFiles()

        return files;
    } catch (error) {
        logger.error(error);
    }
}

// getting frames from iserted video
async function getFrames(video) {
    try {
        const process = await new ffmpeg(`${VIDEOS_DIR}/${video}`);
        const folderName = `${video}_temp`;
        const filepath = `${VIDEOS_DIR}/${folderName}`;

        logger.info(`Making screens of ${video}`);

        // creating temp directory for screenshots
        fs.mkdirSync(filepath);

        // making screens with ffmpeg package
        const frames = await process.fnExtractFrameToJPG(filepath, {
            frame_rate: 1,
            every_n_seconds: 10
        });

        return {
            frames: frames,
            directory: folderName
        };

    } catch (error) {
        logger.error(error);
    }
}

// the name of function tells enought about it. What else do you need? 
async function compareFrames(frames) {
    try {
        let timecodes = [];
        let startpoint = 0;

        console.log('Comparing frames...', );

        frames.sort(natsort());

        // at first compare with empty frame to understand where the song begins
        for (i = 0; i < frames.length; i++) {
            const result = await getDiff(EMPTY_FRAME, frames[i]);
            
            if (result.misMatchPercentage > 0.3) {
                startpoint = i;
                break;
            }
        }

        timecodes.push(startpoint * 10);

        // then compare with other images
        for (i = startpoint; i < frames.length - 1; i++) {
            const result = await getDiff(frames[i], frames[i + 1]);
        
            if (result.misMatchPercentage > 1) {
                timecodes.push((i + 1) * 10); // framenumber * 10 = timecode
            }
        }

        // end of file
        timecodes.push(frames.length * 10);

        return timecodes;

    } catch (e) {
        logger.fatal(e);
    }
}

// crops image and generates .png from .jpg
async function cropAndMakePNG(frameData) {

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    try {
        let frames = [];

        logger.info("Translating JPG into PNG...");
        const readFile = util.promisify(jimp.read);

        for (frame of frameData.frames) {
            try {
                const filename = frame.slice(20, frame.length - 4);
                const img = await readFile(frame);

                const newFrame = `${VIDEOS_DIR}/${frameData.directory}/${filename}.png`;

                logger.debug(frameData.directory);

                img.crop(85, 150, 200, 45);
                img.write(newFrame);

                frames.push(newFrame);

                deleteFile(frame);
            } catch (e) {
                logger.fatal(e);
            }
        }

        await sleep(2000);

        return frames;

    } catch (e) {
        console.log(e);
    }
}

async function generateM3U(timecodes, video, directory) {
    try {
        logger.info('Generating .m3u file...');

        const writeFile = util.promisify(fs.writeFile);
        let data = '';

        timecodes.forEach((timecode, i) => {
            if (i === 0) {
                data += `#EXTVLCOPT:start-time=${timecode}\n`;
            } else if (i < timecodes.length - 1) {
                data += `#EXTVLCOPT:stop-time=${timecode}\n`;
                data += `../${video}\n`;
                data += `#EXTVLCOPT:start-time=${timecode}\n`;
            } else {
                data += `#EXTVLCOPT:stop-time=${timecode}\n`;
                data += `../${video}\n`;
            }
        });

        await writeFile(`${VIDEOS_DIR}/${directory}/result.m3u`, data);

        logger.log(`~~FILE ${video} HANDLED SUCCESFULLY!~~`);
    } catch (err) {
        logger.error(err)
    }
}

// main function
(async () => {
    let videos = await readVideos();

    for (video of videos) {
        let framesData = await getFrames(video);
        const directory = framesData.directory;

        framesData = await cropAndMakePNG(framesData);

        const timecodes = await compareFrames(framesData);

        generateM3U(timecodes, video, directory);
    }

})()