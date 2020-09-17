import reactServer from 'react-dom/server.node.js';
import babel from 'rollup-plugin-babel';

const serverReactPlugin = () => ({
    name: "server-react",
    writeBundle(options, bundle) {
        //Regex helpers
        const escapeRegex = [/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'];

        //Un replace paths
        const unReplacePaths = Object.assign({}, ...Object.entries(options.paths).map(([k, v]) => ({ [v]: k })));
        let code = bundle["index.js"].code;
        Object.entries(unReplacePaths).forEach(([k, v]) => {
            const regex = new RegExp(`(?<=import\\s+([\\w$]+\\s+from)?\\s*(['"]))${k.replace(...escapeRegex)}(?=\\2)`);
            code = code.replace(regex, v);
        });

        //Try dynamically importing code string
        import(`data:text/javascript,${code}`)
            .then(app => {
                console.log(reactServer.renderToString(app))
            })
            .catch(err => {
                console.log(err)
                throw new Error("Couldn't dynamically import react component.");
            });
    }
});

export default [
    {
        input: "./lib/browser/components/pages/index/index.js",
        output: {
            dir: "./dist/browser/components/pages/index/",
            format: 'es',
            paths: {
                react: "/react.development.js"
            }
        },
        external: [
            'react'
        ],
        plugins: [
            babel()
        ]
    }
];