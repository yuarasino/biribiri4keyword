// 定数

/** ビリビリの対象キーワード(regex) */
const D_BIRIBIRI_TARGET = /違います|ちがいます|ちゃいます/
/** ビリビリの強さ(/15) */
const D_BIRIBIRI_LEVEL = 15
/** ビリビリの時間(s) */
const D_BIRIBIRI_DURATION = 10
/** ビリビリの間隔(s) */
const D_BIRIBIRI_INTERVAL = 5

const D_SERIAL_VENDOR_ID = 0x303A
const D_SHOCKER_POWER_DELAY = 1200
const D_SHOCKER_LEVEL_DELAY = 400


// グローバル変数

let gSerialPort = undefined
let gSerialWritableClosed = undefined
let gSerialWriter = undefined
let gShockerQueue = []


// リアクティブ

const brSerialIsConnecting = Vue.ref(false)
const brShockerIsDriving = Vue.ref(false)
const brShockerLevel = Vue.ref(0)
const brShockerDuration = Vue.ref(0)
const brDisplayLevelText = Vue.computed(() => brShockerLevel.value ? String(brShockerLevel.value) : "-")
const brDisplayDurationText = Vue.computed(() => brShockerDuration.value ? String(brShockerDuration.value) : "-")


/** 改行ごとにメッセージを取り出すための変換 */
class CSerialTransformer {
  constructor() {
    this.mMessage = ""
  }
  transform(chunk, controller) {
    this.mMessage += chunk
    const lines = this.mMessage.split("\n")
    this.mMessage = lines.pop()
    lines.forEach((line) => controller.enqueue(line))
  }
  flush(controller) {
    controller.enqueue(this.mMessage)
  }
}


/** ビリビリのパラメータを設定する */
const setShockerParameter = (comment) => {
  comment.data.brShockerLevel = D_BIRIBIRI_LEVEL
  comment.data.brShockerDuration = D_BIRIBIRI_DURATION
}


/** ビリビリ対象のコメントかどうかチェックする */
const checkBiribiriComment = (comment) => {
  if (comment.data.brShockerIsChecked) { return }
  if (!comment.data.isModerator && D_BIRIBIRI_TARGET.test(comment.data.comment)) {
    setShockerParameter(comment)
    gShockerQueue.push(comment)
  }
  comment.data.brShockerIsChecked = true
}


/** シリアルの更新 */
const updateSerial = async () => {
  const delay = (timeout) => new Promise((resolve) => setTimeout(resolve, timeout))
  while (true) {
    let comment = gShockerQueue.shift()
    if (comment) {
      const level = comment.data.brShockerLevel
      const duration = comment.data.brShockerDuration
      try {
        const parameter = (level << 8) | duration
        const message = `-> ${parameter}`
        await gSerialWriter.write(message)
        console.log("[INFO] Serial message sent.", message)
      } catch (error) {
        console.log("[ERROR] Serial error caught.", error)
        gShockerQueue.unshift(comment)
        await disconnectSerial()
      }
      await delay(D_SHOCKER_POWER_DELAY + D_SHOCKER_LEVEL_DELAY * level)
      brShockerLevel.value = level
      brShockerDuration.value = duration
      brShockerIsDriving.value = true
      for (let i=0; i<duration; i++) {
        await delay(1000)
        brShockerDuration.value -= 1
      }
      brShockerLevel.value = 0
      brShockerDuration.value = 0
      brShockerIsDriving.value = false
      await delay(D_BIRIBIRI_INTERVAL)
    }
    await delay(100)
  }
}


/** シリアルの接続 */
const connectSerial = async () => {
  const port = await navigator.serial.requestPort({ filters: [{ usbVendorId: D_SERIAL_VENDOR_ID }]})
  await port.open({ baudRate: 115200 })
  const encoder = new TextEncoderStream()
  const writableClosed = encoder.readable.pipeTo(port.writable)
  const writer = encoder.writable.getWriter()
  gSerialPort = port
  gSerialWritableClosed= writableClosed
  gSerialWriter = writer
  brSerialIsConnecting.value = true
  console.log("[INFO] Serial connected.")
  await updateSerial()
}


/** シリアルの切断 */
const disconnectSerial = async () => {
  gSerialWriter.releaseLock()
  await gSerialWritableClosed
  await gSerialPort.close()
  brShockerLevel.value = 0
  brShockerDuration.value = 0
  brSerialIsConnecting.value = false
  console.log("[INFO] Serial disconnected.")
}


/** Vueアプリケーション */
Vue.createApp({
  setup() {
    return {
      brSerialIsConnecting,
      brDisplayLevelText,
      brDisplayDurationText,
      brShockerIsDriving,
      connectSerial,
    }
  }
}).mount("#brContainer")
