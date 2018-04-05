const fs = require('fs');
const ffmpeg = require('ffmpeg');
const BlinkDiff = require('blink-diff');
const cmd = require('node-cmd');

const VIDEOS_DIR = './videos';
const CYCLE_DURATION = 10;

console.log(`Reading files from "${VIDEOS_DIR}"...`);
let files = fs.readdirSync(VIDEOS_DIR);

console.log(`The content of "${VIDEOS_DIR}":\n`, files);


async function getImages() {
    for (file of files) {
        let filepath = `${VIDEOS_DIR}/${file}`;
        const tempDir = `${VIDEOS_DIR}/${file}_temp`;
        fs.mkdirSync(tempDir);

        await cmd.run(`ffmpeg -i "${filepath}" -r 0.1 -f image2 "${tempDir}/img%03d.jpg"`);
    }
}

async function compareImages() {
    await getImages();
    return('Finished!')
}

getImages()
    .then(() => {
        console.log('Finished!');
    })

