import React from 'react'
import Welcome from '../../common/welcome.js'

class Header extends React.Component {
  render () {
    return [
      <Welcome key='welcome' />,
      <h2 key='h2'>Welcome to the {this.props.page} page!</h2>
    ]
  }
}

export default Header
