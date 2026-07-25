import { app, net, protocol } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'

// 自定义瓦片协议：nav-tiles://{z}/{x}/{y}.png
// 优先返回 userData/offline-tiles 下的本地瓦片，缺失时回退到在线 OSM 瓦片，
// 实现在线/离线无缝混合，应用本身不预置任何离线地图数据。
export const OFFLINE_TILE_SCHEME = 'nav-tiles'
const ONLINE_TILE_BASE_URL = 'https://tile.openstreetmap.org'

export class OfflineTileService {
  // 必须在 app ready 之前调用（Electron 对 registerSchemesAsPrivileged 的要求）
  public registerPrivilegedScheme(): void {
    protocol.registerSchemesAsPrivileged([
      {
        scheme: OFFLINE_TILE_SCHEME,
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          stream: true,
        },
      },
    ])
  }

  public getTilesDir(): string {
    return path.join(app.getPath('userData'), 'offline-tiles')
  }

  // 必须在 app ready 之后调用
  public registerHandler(): void {
    protocol.handle(OFFLINE_TILE_SCHEME, async (request) => {
      let url: URL
      try {
        url = new URL(request.url)
      } catch {
        return new Response('Bad Request', { status: 400 })
      }

      // standard scheme 下 hostname 固定为 tiles（纯数字 host 会被规范化为 IPv4），
      // {z}/{x}/{y}.png 落在 pathname
      const pathMatch = /^\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(url.pathname)
      if (!pathMatch) {
        return new Response('Bad Request', { status: 400 })
      }
      const z = pathMatch[1]
      const x = pathMatch[2]
      const y = pathMatch[3]

      const tilePath = path.join(this.getTilesDir(), z, x, `${y}.png`)
      try {
        const data = await fs.readFile(tilePath)
        return new Response(new Uint8Array(data), {
          headers: { 'Content-Type': 'image/png' },
        })
      } catch {
        // 本地瓦片不存在：回退拉取在线 OSM 瓦片。
        // OSM 瓦片使用策略要求可识别的 User-Agent，Electron net 模块的默认 UA 会被封禁
        return net.fetch(`${ONLINE_TILE_BASE_URL}/${z}/${x}/${y}.png`, {
          headers: {
            'User-Agent': `Nav-Tools/${app.getVersion()} (https://www.openstreetmap.org/copyright)`,
            Referer: 'https://www.openstreetmap.org/',
          },
        })
      }
    })
  }
}
