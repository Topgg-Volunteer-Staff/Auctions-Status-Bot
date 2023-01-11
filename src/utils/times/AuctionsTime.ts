import getNextDayTime from './getNextDayTime'

class AuctionsTime {
  nextBiddingEnd(format: 'F' | 'R' | 't') {
    return `<t:${getNextDayTime('Mon', 19)}:${format}>`
  }
  nextPaymentWindowEnd(format: 'F' | 'R' | 't') {
    return `<t:${getNextDayTime('Tue', 19)}:${format}>`
  }
}

export default AuctionsTime
