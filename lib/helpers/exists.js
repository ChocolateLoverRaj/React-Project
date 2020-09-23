const exists = async promise => {
  try {
    await promise
    return true
  } catch (e) {
    if (e.code === 'ENOENT') {
      return false
    }
  }
}

export default exists
