import ReactDom from './react-dom.js'

const queryParams = Object.assign({}, ...import.meta.url.split('?')[1].split('&').map(param => {
  const [k, v] = param.split('=')
  return { [k]: v }
}));

(async () => {
  const { default: App } = await import(`/scripts/components/pages/${queryParams.page}/index.js`)
  ReactDom.hydrate(App, document.getElementsByTagName('App')[0])
})()
