import { ModalSurface } from '../ui/ModalSurface';

export interface CreditsDialogProps {
  open: boolean;
  onClose: () => void;
}

const licenseUrls = {
  project: new URL('../../ops/provenance/licenses/filmframe-GPL-3.0.txt', import.meta.url).href,
  spektralab: new URL('../../ops/provenance/licenses/SpektraLab-GPL-3.0.txt', import.meta.url).href,
  spektrafilm: new URL('../../ops/provenance/licenses/spektrafilm-profiles-CC-BY-SA-4.0.txt', import.meta.url).href,
  heicTo: new URL('../../ops/provenance/licenses/heic-to-LGPL-3.0.txt', import.meta.url).href,
  provenance: new URL('../../ops/provenance/README.md', import.meta.url).href,
};

const sources = [
  {
    title: 'FilmFrame · GPL-3.0-or-later',
    body: '本项目以 GPL-3.0-or-later 发布，完整文本见 LICENSE，署名与对应源码说明见 NOTICE。每个发行标签所指的提交就是对应源码，构建步骤见仓库 README。',
    href: 'https://github.com/Zeno-cc/FilmFrame',
    license: licenseUrls.project,
  },
  {
    title: 'SpektraLab · GPL-3.0-or-later',
    body: '物理片边、负片流程与 CineStill no-rem-jet 背反射参考其实现。保留原作者与修改声明，不使用其名称、图标、封面、截图或字体作为 FilmFrame 品牌资源。',
    href: 'https://github.com/JamesQiu2005/SpektraLab',
    license: licenseUrls.spektralab,
  },
  {
    title: 'spektrafilm · CC BY-SA 4.0',
    body: 'Andrea Volpato 的光谱底片、相纸与直接衍生资源。保留原许可、来源链接和每项转换记录；成品照片不因此改变所有权。',
    href: 'https://github.com/andreavolpato/spektrafilm',
    license: licenseUrls.spektrafilm,
  },
  {
    title: '正片光谱派生表 · CC BY-SA 4.0',
    body: 'Provia、Velvia、Ektachrome 与 Kodachrome 使用各自固定 profile 的下降曲线、正片 DIR 和直接胶片扫描，不经过负片相纸输出。派生表保留来源与修改记录。',
    href: 'https://github.com/andreavolpato/spektrafilm',
    license: licenseUrls.spektrafilm,
  },
  {
    title: 'SpektraLab 产品银盐数据 · 独立审核',
    body: 'Acros II、HP5、Tri-X 与 T-Max 100 使用产品 profile 和 Multigrade grade 2。相纸为可行性拟合，产品数据与资料权利仍需独立审核，不套用 spektrafilm 的 CC 声明。',
    href: 'https://github.com/JamesQiu2005/SpektraLab',
    license: licenseUrls.provenance,
  },
  {
    title: 'heic-to · LGPL-3.0-or-later',
    body: '静态 HEIC 在浏览器本地转换，依赖包不修改。分发时还需审查对应源码、重链接和许可通知要求。',
    href: 'https://github.com/hoppergee/heic-to',
    license: licenseUrls.heicTo,
  },
] as const;

export function CreditsDialog({ open, onClose }: CreditsDialogProps) {
  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      title="来源与许可"
      description="本地处理不改变第三方代码、数据和历史素材的分发义务。"
      size="lg"
      className="ff-credits-dialog"
      bodyClassName="space-y-5 p-5"
    >
      <p className="text-xs leading-6 text-[var(--ff-paper-muted)]">
        本页记录当前已接入的来源与许可，不代表全部资源已获公开发布清权。FilmFrame 的照片仅在当前设备处理，不上传。
      </p>
      <div className="space-y-4">
        {sources.map(source => (
          <section key={source.title} className="rounded-[5px] border border-[var(--ff-line-soft)] p-3">
            <h3 className="text-sm font-medium text-[var(--ff-paper)]">{source.title}</h3>
            <p className="mt-2 text-xs leading-6 text-[var(--ff-paper-muted)]">{source.body}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <a className="text-[var(--ff-amber)] underline underline-offset-2" href={source.href} target="_blank" rel="noopener noreferrer">上游来源</a>
              <a className="text-[var(--ff-amber)] underline underline-offset-2" href={source.license} target="_blank" rel="noopener noreferrer">许可文本</a>
            </div>
          </section>
        ))}
      </div>
      <section className="rounded-[5px] border border-[var(--ff-warning)] p-3">
        <h3 className="text-sm font-medium text-[var(--ff-paper)]">仍需权利审核</h3>
        <p className="mt-2 text-xs leading-6 text-[var(--ff-paper-muted)]">
          Hanatos 光谱上采样常量、两个继承该常量的派生表与 CineStill 空间模型的来源权利仍未核实。项目所有者已于 2026-11-20 在有记录的风险接受前提下决定分发，`npm run verify:provenance` 会持续列出这些条目，它们不会被标记为已核实。完整清单见来源与发布清单与 NOTICE。
        </p>
        <a className="mt-2 inline-block text-xs text-[var(--ff-amber)] underline underline-offset-2" href={licenseUrls.provenance} target="_blank" rel="noopener noreferrer">完整来源与发布清单</a>
      </section>
    </ModalSurface>
  );
}
