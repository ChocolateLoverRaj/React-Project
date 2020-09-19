//My Modules
import compareBufferStream from "./lib/helpers/compare-buffer-stream.js";

//Npm Modules
import areStreamsSame from 'are-streams-same';
import { rollup } from 'rollup';
import rollupBabelPlugin from '@rollup/plugin-babel';

//Node.js Modules
import { createReadStream, createWriteStream } from 'fs';
import { readdir, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { once } from 'events';

const __dirname = dirname(import.meta.url.slice(8));

const babelPlugin = rollupBabelPlugin.getBabelInputPlugin({ babelHelpers: 'bundled' });

const build = async () => {
    //Check hashes
    //If the index.js file has changed, then redo the output index.js, app.html
    //If the index.html file has changed, then redo the index.html
    //If the app.html has changed, redo the index.html

    const libPagesPath = join(__dirname, "./lib/browser/components/pages/");
    const distPagesPath = join(__dirname, "./dist/browser/components/pages/");

    let noDistPages = false;
    const [libPages, distPages] = await Promise.all([
        //Read the lib/browser/components/pages/ dir
        readdir(libPagesPath).catch(err => {
            if (err.code === 'ENOENT') {
                throw new Error("Lib pages folder doesn't exist.")
            }
            else {
                throw err;
            }
        }),

        //Read the dist/browser/components/pages dir
        readdir(distPagesPath).catch(err => {
            if (err.code === 'ENOENT') {
                noDistPages = true;
            }
            else {
                throw err;
            }
        })
    ]);

    //Loop through the lib pages
    for (const page of libPages) {
        (async () => {
            const noDistPage = noDistPages || !distPages.includes(page);

            const distPagePath = join(distPagesPath, `./${page}/`);
            const libPagePath = join(libPagesPath, `./${page}/`);

            const inputJsHashPath = join(distPagePath, './input-js-hash.dat');
            const inputJsPath = join(libPagePath, './index.js');

            const browserJsHashPath = join(distPagePath, './browser-js-hash.dat');
            const browserJsPath = join(distPagePath, './browser.js');

            const buildJs = async () => {
                const bundle = rollup({
                    input: inputJsPath,
                    external: 'react',
                    plugins: [babelPlugin]
                });

                const outputCode = (async () => {
                    return (await (await bundle).generate({
                        format: 'es',
                        paths: {
                            react: '/scripts/react.js'
                        }
                    })).output[0].code;
                })()

                const outputHash = (async () => {
                    return createHash('sha256')
                        .update(await outputCode)
                        .digest()
                })()

                const writeBrowserJs = async () => {
                    const writeOutputHash = (async () => {
                        //await writeFile(browserJsHashPath, await outputHash)
                    })()

                    const writeBrowserJs = (async () => {
                        writeFile(browserJsPath, await outputCode)
                    })()

                    await Promise.all([writeOutputHash, writeBrowserJs])
                    console.log("done writing browserJs")
                }


                if (!noDistPage) {
                    const browserJsHash = createReadStream(browserJsHashPath)
                    try {
                        const different = await compareBufferStream(outputHash, browserJsHash)
                        if (different) {
                            writeBrowserJs()
                        }
                        else {
                            console.log("same hash")
                        }
                    }
                    catch (e) {
                        if (e.code === 'ENOENT') {
                            console.log("no hash")
                            writeBrowserJs()
                        }
                        else {
                            throw e
                        }
                    }
                }
                else {
                    console.log("no dist page")
                }
            }

            if (!noDistPage) {
                const changedBuffer = await new Promise((resolve, reject) => {
                    let oldInputJsHash = createReadStream(inputJsHashPath);
                    let inputJs = createReadStream(inputJsPath);
                    let newInputJsHash = inputJs.pipe(createHash('sha256'));
                    let newInputJsHashBuff = (async () => {
                        return (await once(newInputJsHash, 'data'))[0];
                    })();

                    oldInputJsHash.on('error', err => {
                        if (err.code === 'ENOENT') {
                            resolve(newInputJsHashBuff);
                        }
                        else {
                            reject(err);
                            inputJs.destroy(err);
                        }
                    })

                    inputJs.on('error', err => {
                        if (err.code === 'ENOENT') {
                            reject("Input js file doesn't exist.");
                        }
                        else {
                            reject(err);
                        }
                        oldInputJsHash.destroy(err);
                    })

                    newInputJsHash.on('error', err => {
                        reject(err);
                    });

                    areStreamsSame(oldInputJsHash, newInputJsHash).then(({ same }) => {
                        if (same) {
                            resolve(false);
                        }
                        else {
                            resolve(newInputJsHashBuff);
                        }
                    })
                });
                if (changedBuffer) {
                    //await writeFile(inputJsHashPath, changedBuffer);
                    await buildJs();
                }
                else {
                    console.log("No changes");
                }
            }
            else {
                await mkdir(distPagePath, { recursive: true });
                await once(createReadStream(inputJsPath)
                    .pipe(createHash('sha256'))
                    .pipe(createWriteStream(inputJsHashPath)),
                    'finish'
                );
                await buildJs();
            }
        })();
    }
};

build();

/*
const example = [
    {
        input: "./lib/browser/components/pages/index/index.js",
        output: [
            {
                file: "./dist/browser/components/pages/index/index.js",
                format: 'es',
                paths: {
                    react: "/scripts/react.js"
                }
            },
            {
                file: "./dist/browser/components/pages/index/temp.js",
                format: 'es',
                plugins: [
                    serverReactPlugin()
                ]
            }
        ],
        external: [
            'react'
        ],
        plugins: [
            babel()
        ]
    }
];
*/