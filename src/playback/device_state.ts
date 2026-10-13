/**
 * 已知的设备非播放状态。L15A 直链播放被打断后会返回 3；查询失败的 -1 不是 idle。
 * 状态可能误报：有有效进度时，消费点仍须优先检查连续推进，不能仅凭 idle 判结束。
 */
export function isDeviceIdle(status: number): boolean {
  return status === 0 || status === 2 || status === 3;
}

export function isDeviceStatusKnown(status: number): boolean {
  return status === 1 || isDeviceIdle(status);
}
