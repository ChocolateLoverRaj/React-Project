//Rollup plugins
import babel from 'rollup-plugin-babel';

//React
import reactServer from 'react-dom/server.node.js';

//Node.js Modules
import { createReadStream, createWriteStream } from 'fs';
import { unlink, readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import replaceStream from 'replacestream';
import { once } from 'events';
import { createHash } from 'crypto';

const __dirname = dirname(import.meta.url.slice(8));

const serverReactPlugin = () => ({
    name: "server-react",
    async writeBundle(options, bundle) {
        const tempFile = bundle['temp.js'];
        const { default: App } = await import(options.file);
        const html = reactServer.renderToString(App);
        const htmlInputPath = join(dirname(tempFile.facadeModuleId), "./index.html");
        const htmlOutputPath = join(dirname(options.file), "./index.html");

        //Create a stream that reads input html and writes output html, replacing <App></App> with the html.
        var readStream = createReadStream(htmlInputPath);
        var writeStream = readStream
            .pipe(replaceStream("<App></App>", `<App>${html}</App>`, { limit: 1 }))
            .pipe(createWriteStream(htmlOutputPath));
        await Promise.all([
            (async () => {
                await once(readStream, 'close');
                await unlink(options.file);
            })(),
            once(writeStream, 'close')
        ]);
    }
});

const getInputs = async () => {
    //Check hashes
    //If the index.js file has changed, then redo the output index.js, app.html
    //If the index.html file has changed, then redo the index.html
    //If the app.html has changed, redo the index.html

    const libPagesPath = join(__dirname, "./lib/browser/components/pages/");
    const distPagesPath = join(__dirname, "./dist/browser/components/pages/");

    const [libPages, distPages] = await Promise.all([
        //Read the lib/browser/components/pages/ dir
        readdir(libPagesPath),

        //Read the dist/browser/components/pages dir
        readdir(distPagesPath)
    ]);

    //Loop through the lib pages
    for (const page of libPages) {
        //Check if the page is also in dist pages
        if (distPages.includes(page)) {
            //Check for hashes
            const jsHash = readFile(join(distPagesPath, `./${page}/js hash.txt`), 'utf-8');
            const appHtmlHash = readFile(join(distPagesPath, `./${page}/app html hash.txt`), 'utf-8');
            const indexHtmlHash = readFile(join(distPagesPath, `./${page}/index html hash.txt`), 'utf-8');

            //Read the input index.js and index.html files
            const indexJsStream = createReadStream(join(libPagesPath, `./${page}/index.js`));
            const indexHtmlStream = createReadStream(join(libPagesPath, `./${page}/index.html`));

            const writeHash = createHash('sha256');
            indexJsStream.pipe(writeHash).on('data', data => {
                console.log(data.toString('hex'))
            });
        }
        else {
            //We need to generate index.html, app.html, and index.js
        }
    }
};

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

export default getInputs();