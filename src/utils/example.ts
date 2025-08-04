function mainProcessMessage(_event: any, ...args: any[]) {
  console.log('[Receive Main-process message]:', ...args)
}

export { mainProcessMessage }
