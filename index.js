const fs = require('fs');
const ffmpeg = require('ffmpeg');
const BlinkDiff = require('blink-diff');

const VIDEOS_DIR = './videos';
const CYCLE_DURATION = 10;

(async () => {
    try {
        console.log(`Reading files from "${VIDEOS_DIR}"...`);

        const files = fs.readdirSync(VIDEOS_DIR);

        console.log(`The content of "${VIDEOS_DIR}" \n ${files}`);

        for (file of files) {


            if (!file.split('.')[1]) {
                continue;
            }

            try {

                var process = await new ffmpeg(`${VIDEOS_DIR}/${file}`);

                const frames = await process.fnExtractFrameToJPG(`${VIDEOS_DIR}/temp`, {
                    frame_rate: 1,
                    every_n_seconds: 10
                });

                console.log(`Frames: ${frames}`);

            } catch (error) {
                console.log(error.message)
            }

        }
    } catch (error) {
        console.log(error.message);
    }
})();
