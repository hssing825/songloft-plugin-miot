/// <reference types="@mimusic/plugin-sdk" />

// 临时类型增强：@mimusic/plugin-sdk@0.8.1 的 MimusicPlaylists.getSongs 仅声明
// 1 个参数，但运行时（mimusic 后端）实际接受 (id, options) 两个参数（用于分页）。
// SDK 源码已在主仓库扩展为 2-arg 签名；待 0.8.2 发布后可删除本 augmentation。
declare module '@mimusic/plugin-sdk' {
  interface MimusicPlaylists {
    getSongs(
      playlistId: number,
      options?: { limit?: number; offset?: number },
    ): Promise<import('@mimusic/plugin-sdk').Song[]>;
  }
}

export {};
