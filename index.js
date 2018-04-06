const log4js = require('log4js');
const fs = require('fs');
const ffmpeg = require('ffmpeg');
const BlinkDiff = require('blink-diff');
const compare = require('resemblejs/compare');
const util = require('util');
const jimp = require('jimp');
const rmdir = require('rmdir');

const VIDEOS_DIR = './videos';
const CYCLE_DURATION = 10;

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
                rmdir(`${VIDEOS_DIR}/${file}`, function(err) {
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
                file = file.replace(/\s+/g, '_');
                logger.debug(`New name of ${oldName} is`, file);
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

async function compareTwoFrames(frame1, frame2) {

    try {
        logger.info(`Comparing ${frame1} and ${frame2}`);

        const diff = new BlinkDiff({
            imageAPath: frame1,
            imageBPath: frame2,
    
            thresholdType: BlinkDiff.THRESHOLD_PERCENT,
            threshold: 0.005,
    
            blockOut: {
                x: 0,
                y: 0,
                wifth: 450,
                height: 150
            }
        });

        logger.debug(diff);

        diff.run((err, res) => {
            if (err) logger.error(err);
            result = res;

            return res;
        })


    } catch (error) {
        logger.fatal(error);
    }
}

async function compareFrames(frames) {
    try {
        console.log('Comparing frames...', );

        for (i = 0; i < frames.length - 1; i++) {
            logger.trace(await compareTwoFrames(frames[i], frames[i+1]));
        }
    } catch (e) {
        logger.fatal(e);
    }
}

// b`cause blink-diff works only with .png
async function turnJPGIntoPNG(frameData) {

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

                logger.trace(img);

                const newFrame = `${VIDEOS_DIR}/${frameData.directory}/${filename}.png`;

                img.crop(0, 0, 450, 250);
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

// main function
(async () => {
    let videos = await readVideos();

    for (video of videos) {
        let framesData = await getFrames(video);
        logger.info(framesData);

        framesData = await turnJPGIntoPNG(framesData);

        compareFrames(framesData);
    }

})()