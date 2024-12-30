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
