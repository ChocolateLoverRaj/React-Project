import { Readable } from 'stream';

const buff = Buffer.alloc(0);

/**
 * 
 * @param {Readable} stream1 
 * @param {Readable} stream2 
 */
const areStreamsSame = (stream1, stream2) => new Promise((resolve, reject) => {
    const streams = [
        {
            stream: stream1,
            length: 0,
            done: false
        },
        {
            stream: stream2,
            length: 0,
            done: false
        }
    ];

    var unComparedBuff = Buffer.alloc(0);

    const destroy = () => {
        stream1.off('data', stream1DataHandler);
        stream2.off('data', stream2DataHandler);

        stream1.off('end', stream1EndHandler);
        stream2.off('end', stream2EndHandler);
    }

    const getRelativeStream = streamNumber => ({
        currentStream: streams[streamNumber],
        otherStream: streams[streamNumber === 0 ? 1 : 0]
    })

    /**
     * 
     * @param {number} streamNumber 
     * @param {Buffer|string} data 
     */
    const dataHandler = (streamNumber, data) => {
        //The streams array objects.
        const { currentStream, otherStream } = getRelativeStream(streamNumber);

        //Convert string data to buffer
        if (typeof data === 'string') {
            data = Buffer.from(data);
        }

        //Check if this stream is a greater length than the other one
        if (otherStream.done && currentStream.length + data.length > otherStream.length) {
            resolve({ same: false, reason: "The length of a stream exceeded the length of the other stream which was finished." });
            destroy();
            return;
        }

        //Compare to unComparedBuff
        if (currentStream.length < otherStream.length) {
            //This is how much this buffer is less than the length difference
            const lessBy = otherStream.length - (currentStream.length + data.length);

            var targetEnd;
            var sourceEnd;
            if (lessBy >= 0) {
                //Compare this with part of the other buffer
                //Could be the whole other buffer is lessBy === 0
                targetEnd = unComparedBuff.length - lessBy;
            }
            else {
                //Compare part of this with the other buffer
                sourceEnd = data.length + lessBy;
            }
            if (data.compare(unComparedBuff, undefined, targetEnd, undefined, sourceEnd) !== 0) {
                resolve({ same: false, reason: "A part of the streams is different." });
                destroy();
                return;
            }
        }
        else {
            //They were equal
            unComparedBuff = data;
        }

        //Update current stream's length
        currentStream.length += data.length;

        //Calculate if we should pause this stream
        const lengthDifference = currentStream.length - otherStream.length;
        if (lengthDifference > 0) {
            unComparedBuff = data.slice(-lengthDifference);

            currentStream.stream.pause();
            otherStream.stream.resume();
        }
    }

    const endHandler = streamNumber => {
        const { currentStream, otherStream } = getRelativeStream(streamNumber);

        currentStream.done = true;
        if (currentStream.length < otherStream.length) {
            resolve({ same: false, reason: "The streams are of different lengths." });
            destroy();
            return;
        }
        else {
            resolve({ same: true, reason: "Both streams ended with equal lengths." });
            destroy();
            return;
        }
    }

    const stream1DataHandler = dataHandler.bind(undefined, 0);
    const stream2DataHandler = dataHandler.bind(undefined, 1);

    const stream1EndHandler = endHandler.bind(undefined, 0);
    const stream2EndHandler = endHandler.bind(undefined, 1);

    stream1.on('data', stream1DataHandler);
    stream2.on('data', stream2DataHandler);

    stream1.on('end', stream1EndHandler);
    stream2.on('end', stream2EndHandler);
});

export default areStreamsSame;