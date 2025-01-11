export const dateToDayString = (date: Date):string => {
  return date.toLocaleDateString().replace(/\//g, '-').split('-').map(item => item.padStart(2, '0')).join('-')
}

export function convertSeconds(seconds: number): string {
  const hours: number = Math.floor(seconds / 3600);
  const minutes: number = Math.floor((seconds % 3600) / 60);
  const remainingSeconds: number = seconds % 60;
  // 格式化输出 hh:mm:ss 补0
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export const calcRsi = (ticks: number[]): number[] => {
  let lastClosePx = ticks[0];
  const days = [12]
  const result = {};
  for (let i = 0 ; i < ticks.length; i ++) {
    const c = ticks[i];
    const m = Math.max(c-lastClosePx, 0), a = Math.abs(c-lastClosePx);
    for (let di = 0; di < days.length; di++) {
      const d = days[di];
      if (!result.hasOwnProperty("rsi"+d)) {
        result["lastSm"+d] = result["lastSa"+d]  = 0;
        result["rsi"+d] = [0];
      } else {
        result["lastSm"+d] = (m + (d - 1) * result["lastSm"+d]) / d;
        result["lastSa"+d] = (a + (d - 1) * result["lastSa"+d]) / d;
        if (result["lastSa"+d] != 0) {
          result["rsi"+d].push(result["lastSm"+d] / result["lastSa"+d] * 100);
        } else {
          result["rsi"+d].push(0);
        }
      }
    }
    lastClosePx = c;
  }
  return result["rsi12"];
}
