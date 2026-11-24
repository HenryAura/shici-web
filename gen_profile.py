"""生成 iOS Web Clip 描述文件（.mobileconfig）

用法:
    python gen_profile.py <URL> [输出文件名]

要点:
  - PayloadType = com.apple.webClip.managed
  - FullScreen = true   → 打开后无 Safari 地址栏
  - IsRemovable = true  → 图标可正常删除（样例里设成 false，装了就删不掉）
  - Icon 内嵌 base64，iOS 会用来自动生成圆角图标
"""
import base64
import sys
import uuid
import plistlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ICON = ROOT / 'icons' / 'icon-1024.png'


def build(url: str, label: str = '识词') -> bytes:
    icon_data = ICON.read_bytes()  # plistlib 自动编码为 <data> base64

    clip_id = 'com.apple.webClip.managed.' + str(uuid.uuid4()).upper()
    profile = {
        'PayloadType': 'Configuration',
        'PayloadVersion': 1,
        'PayloadIdentifier': 'com.shiyan.shici.webclip',
        'PayloadUUID': str(uuid.uuid4()).upper(),
        'PayloadDisplayName': label,
        'PayloadDescription': '把「识词」放到主屏幕，全屏打开，像 App 一样用',
        'PayloadRemovalDisallowed': False,
        'ConsentText': {
            'default': f'将「{label}」添加到主屏幕'
        },
        'PayloadContent': [
            {
                'PayloadType': 'com.apple.webClip.managed',
                'PayloadVersion': 1,
                'PayloadIdentifier': clip_id,
                'PayloadUUID': str(uuid.uuid4()).upper(),
                'PayloadDisplayName': 'Web Clip',
                'PayloadDescription': '配置 Web Clip 设置',
                'Label': label,
                'URL': url,
                'FullScreen': True,
                'Precomposed': True,
                'IsRemovable': True,
                'IgnoreManifestScope': False,
                'Icon': icon_data,
            }
        ],
    }
    return plistlib.dumps(profile, fmt=plistlib.FMT_XML)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    url = sys.argv[1]
    if not url.startswith('https://'):
        print('警告: iOS 的 ATS 会拦截 http 地址，Web Clip 可能无法打开')
    out = ROOT / (sys.argv[2] if len(sys.argv) > 2 else '识词.mobileconfig')
    data = build(url)
    out.write_bytes(data)
    print('已生成:', out)
    print('大小: %.1f KB' % (len(data) / 1024))
    print('URL:', url)
