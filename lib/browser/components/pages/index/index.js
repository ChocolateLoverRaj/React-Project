import React from 'react'
import Header from './header.js'

class Good extends React.Component {
  constructor () {
    super()
    this.state = { clicked: false }
  }

  onClick () {
    this.setState({ clicked: true })
  }

  render () {
    return [
      <button key='button' onClick={this.onClick.bind(this)}>Good</button>,
      this.state.clicked ? <h2 key='good'>Good!</h2> : null
    ]
  }
}

class App extends React.Component {
  render () {
    return [
      <Header key='header' page='index' />,
      <Good key='good' />
    ]
  }
}

const app = <App />

export default app
