import { criminisiInpaint } from './src/algorithm.js'

self.onmessage = function (e) {
  const { id, imageData, width, height, selections } = e.data

  const result = criminisiInpaint(imageData, width, height, selections)

  self.postMessage(
    { id, result, width, height },
    { transfer: [result.buffer] }
  )
}
