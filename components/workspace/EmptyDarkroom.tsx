import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent } from 'react';
import { UploadIcon } from '../icons/FilmFrameIcons';
import { Button } from '../ui/Button';
import {
  getNextPhotographyQuoteUpdateDelay,
  getPhotographyQuoteIndexAt,
  photographyQuotes,
} from '../../services/photographyQuotes';
import {
  DARKROOM_GALLERY_SPEED_PX_PER_SECOND,
  decodeDarkroomGalleryImage,
  refreshDarkroomGallery,
  type DarkroomGalleryPhoto,
} from '../../services/darkroomGallery';
import { BUNDLED_PHOTO, BUNDLED_PHOTOS } from '../../services/bundledDarkroomGallery';

const PROCESS_NOTES = ['选片', '调整', '出片'] as const;
const GALLERY_RETRY_MS = 15 * 60 * 1000;

export interface EmptyDarkroomProps {
  isDragActive?: boolean;
  uploadDisabled?: boolean;
  onChoosePhotos: () => void;
  className?: string;
}

export function EmptyDarkroom({
  isDragActive = false,
  uploadDisabled = false,
  onChoosePhotos,
  className = '',
}: EmptyDarkroomProps) {
  const [quoteIndex, setQuoteIndex] = useState(() => getPhotographyQuoteIndexAt(Date.now(), photographyQuotes.length));
  const [photos, setPhotos] = useState<DarkroomGalleryPhoto[]>(BUNDLED_PHOTOS);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const photoIndexRef = useRef(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const exposuresRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<Animation | undefined>(undefined);
  const progressRef = useRef(0);
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const [isPageHidden, setIsPageHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    if (photographyQuotes.length < 2) return undefined;
    const timer = window.setTimeout(() => {
      setQuoteIndex(getPhotographyQuoteIndexAt(Date.now(), photographyQuotes.length));
    }, getNextPhotographyQuoteUpdateDelay(Date.now()));
    return () => window.clearTimeout(timer);
  }, [quoteIndex]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(media.matches);
    const updateVisibility = () => setIsPageHidden(document.hidden);
    media.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);
    updateMotion();
    updateVisibility();
    return () => {
      media.removeEventListener('change', updateMotion);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    if (isPageHidden) return undefined;
    const controller = new AbortController();
    let active = true;
    let retryTimer: number | undefined;

    const loadGallery = async () => {
      try {
        const { batch } = await refreshDarkroomGallery({ signal: controller.signal });
        const assets = new Map(batch.assets.map(asset => [asset.id, asset]));
        const blobs = batch.photos.map(photo => assets.get(photo.assetId)?.blob);
        if (blobs.some(blob => !blob)) throw new Error('公共摄影缓存缺少图片资源');
        // Decode all twelve persisted assets before replacing anything on screen.
        await Promise.all(blobs.map(blob => decodeDarkroomGalleryImage(blob!, controller.signal)));
        if (!active) return;
        const nextPhotos = batch.photos.map((photo, index) => ({
          ...photo,
          imageUrl: URL.createObjectURL(blobs[index]!),
        }));
        if (nextPhotos.some((photo, index) => photo.id !== photosRef.current[index]?.id)) {
          progressRef.current = 0;
          photoIndexRef.current = 0;
          setPhotoIndex(0);
        }
        setPhotos(nextPhotos);
        // A retained expired batch means refresh failed. Back off instead of
        // immediately retrying the public API in a loop.
        expiresAtRef.current = batch.expiresAt > Date.now()
          ? batch.expiresAt
          : Date.now() + GALLERY_RETRY_MS;
      } catch {
        // Network, validation, decode, cancellation and storage failures retain
        // the current cached photograph or the permanent bundled fallback.
        if (active) {
          expiresAtRef.current = Date.now() + GALLERY_RETRY_MS;
          retryTimer = window.setTimeout(() => {
            if (active) setRefreshVersion(version => version + 1);
          }, GALLERY_RETRY_MS);
        }
      }
    };
    void loadGallery();
    return () => {
      active = false;
      controller.abort(new DOMException('空暗房已卸载', 'AbortError'));
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [isPageHidden, refreshVersion]);

  useEffect(() => {
    const ownedUrls = photos
      .map(photo => photo.imageUrl)
      .filter(url => url.startsWith('blob:'));
    return () => ownedUrls.forEach(url => URL.revokeObjectURL(url));
  }, [photos]);

  const expiresAtRef = useRef(Number.POSITIVE_INFINITY);
  useEffect(() => {
    if (isPageHidden) return undefined;
    if (!Number.isFinite(expiresAtRef.current)) return undefined;
    if (expiresAtRef.current <= Date.now()) {
      setRefreshVersion(version => version + 1);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setRefreshVersion(version => version + 1);
    }, expiresAtRef.current - Date.now());
    return () => window.clearTimeout(timer);
  }, [isPageHidden, photos]);

  const rotationPaused = isHovered || hasFocus || isDragActive || isPageHidden || reducedMotion;
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  const pausedRef = useRef(rotationPaused);
  useEffect(() => {
    pausedRef.current = rotationPaused;
  }, [rotationPaused]);

  useLayoutEffect(() => {
    const track = trackRef.current;
    const exposures = exposuresRef.current;
    if (!track || !exposures) return undefined;
    const duration = { current: 1 };

    const updateAttribution = () => {
      const currentTime = Number(animationRef.current?.currentTime ?? 0);
      const frameDuration = duration.current / photos.length;
      const nextIndex = reducedMotionRef.current
        ? 0
        : Math.floor((currentTime % duration.current) / frameDuration) % photos.length;
      if (nextIndex !== photoIndexRef.current) {
        photoIndexRef.current = nextIndex;
        setPhotoIndex(nextIndex);
      }
    };

    const restart = () => {
      animationRef.current?.cancel();
      animationRef.current = undefined;
      const first = exposures.children[0] as HTMLElement | undefined;
      const duplicate = exposures.children[photos.length] as HTMLElement | undefined;
      if (!first || !duplicate) return;
      const distance = duplicate.offsetLeft - first.offsetLeft;
      if (distance <= 0) return;
      duration.current = distance / DARKROOM_GALLERY_SPEED_PX_PER_SECOND * 1000;
      const animation = track.animate(
        [
          { transform: 'translate3d(0, 0, 0)' },
          { transform: `translate3d(${-distance}px, 0, 0)` },
        ],
        { duration: duration.current, iterations: Infinity, easing: 'linear' },
      );
      animationRef.current = animation;
      animation.currentTime = progressRef.current * duration.current;
      if (pausedRef.current) animation.pause();
    };

    const observer = new ResizeObserver(() => {
      const current = animationRef.current;
      if (current?.currentTime !== null && current?.currentTime !== undefined) {
        progressRef.current = (Number(current.currentTime) % duration.current) / duration.current;
      }
      restart();
    });
    observer.observe(exposures);
    restart();
    updateAttribution();
    const timer = window.setInterval(updateAttribution, 250);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      animationRef.current?.cancel();
      animationRef.current = undefined;
    };
  }, [photos]);

  useEffect(() => {
    if (rotationPaused) animationRef.current?.pause();
    else void animationRef.current?.play();
  }, [rotationPaused]);

  useEffect(() => {
    if (!reducedMotion) return;
    photoIndexRef.current = 0;
    setPhotoIndex(0);
  }, [reducedMotion]);

  const quote = photographyQuotes[quoteIndex] ?? photographyQuotes[0];
  const photo = photos[photoIndex] ?? BUNDLED_PHOTO;
  const pauseOnFocusLoss = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setHasFocus(false);
  };
  const markPhotoFailed = () => {
    if (photosRef.current[0]?.id.startsWith('bundled-')) return;
    progressRef.current = 0;
    photoIndexRef.current = 0;
    setPhotoIndex(0);
    setPhotos(BUNDLED_PHOTOS);
  };
  const filmPhotos = [...photos, ...photos];

  const choosePhotos = (
    <div className="ff-empty-darkroom__actions" data-import-action>
      <Button
        id="workspace-add-photos"
        variant="primary"
        size="lg"
        leadingIcon={<UploadIcon />}
        onClick={onChoosePhotos}
        disabled={uploadDisabled}
      >
        选择照片
      </Button>
      <p className="ff-empty-darkroom__privacy">
        也可以把照片拖到这里。照片只在当前设备处理，不会上传。
      </p>
    </div>
  );

  return (
    <section
      className={`ff-empty-darkroom relative isolate overflow-hidden ${className}`}
      aria-labelledby="empty-darkroom-title"
      data-drag-active={isDragActive}
      data-gallery-paused={rotationPaused}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setHasFocus(true)}
      onBlurCapture={pauseOnFocusLoss}
    >
      <div className="ff-empty-darkroom__layout">
        <div className="ff-empty-darkroom__intro">
          <h1 id="empty-darkroom-title">让这一卷，慢慢显影</h1>
          <p className="ff-empty-darkroom__intro-copy">
            把喜欢的照片，装进真实的 135 胶片。<br />
            选片、微调，然后收藏这一卷。
          </p>
          <div className="ff-empty-darkroom__intro-actions" />
        </div>

        <figure className="ff-empty-darkroom__visual" data-gallery-batch-size={photos.length}>
          <div className="ff-empty-darkroom__film">
            <div
              ref={trackRef}
              className="ff-empty-darkroom__film-track"
              data-testid="empty-darkroom-film-track"
              data-photo-index={photoIndex}
              data-gallery-speed={DARKROOM_GALLERY_SPEED_PX_PER_SECOND}
            >
              <div className="ff-empty-darkroom__film-rail" data-testid="empty-darkroom-film-rail" />
              <div ref={exposuresRef} className="ff-empty-darkroom__exposures" role="group" aria-label="经典纪实摄影示意">
                {filmPhotos.map((item, index) => (
                  <div
                    className="ff-empty-darkroom__exposure-frame"
                    data-testid="empty-darkroom-exposure-frame"
                    data-gallery-photo-id={item.id}
                    aria-hidden={index >= photos.length ? true : undefined}
                    key={`${item.id}-${index}`}
                    style={{ gridColumn: index + 1 }}
                  >
                    <div className="ff-empty-darkroom__exposure-content">
                      <div className="ff-empty-darkroom__demo-frame">
                        <img
                          className="ff-empty-darkroom__photo"
                          src={item.imageUrl}
                          alt={index < photos.length ? `${item.title}，非胶片渲染结果` : ''}
                          width={item.width}
                          height={item.height}
                          fetchPriority={index === 0 ? 'high' : 'auto'}
                          data-gallery-photo-id={item.id}
                          onError={markPhotoFailed}
                        />
                      </div>
                    </div>
                    <div className="ff-empty-darkroom__film-caption" aria-hidden="true">
                      <span>HUMAN DOCUMENTS</span>
                      <span>{String((index % photos.length) + 1).padStart(2, '0')}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="ff-empty-darkroom__film-rail" data-testid="empty-darkroom-film-rail" />
            </div>
          </div>
          <figcaption aria-live="off">
            <span>照片示意 · 非胶片渲染结果</span>
            <span className="ff-empty-darkroom__attribution">
              <a href={photo.sourceUrl} target="_blank" rel="noreferrer no-referrer">
                {photo.artist} / Wikimedia Commons
              </a>
              <span aria-hidden="true"> · </span>
              <a href={photo.licenseUrl} target="_blank" rel="noreferrer no-referrer">{photo.licenseName}</a>
            </span>
          </figcaption>
        </figure>

        {choosePhotos}
      </div>

      <div className="ff-empty-darkroom__context" data-testid="empty-darkroom-context">
        <div
          className="ff-empty-darkroom__quote-stage"
          data-quote-id={quote.id}
          data-testid="photography-quote"
          aria-live="off"
        >
          <blockquote className="ff-empty-darkroom__quote-text" lang="zh-Hans">
            “{quote.displayTextZhHans}”
          </blockquote>
          <div className="ff-empty-darkroom__quote-meta">
            <cite className="ff-empty-darkroom__quote-cite">
              {quote.authorZhHans ?? quote.author}
              <span aria-hidden="true"> / </span>
              <a
                className="ff-empty-darkroom__quote-source"
                href={quote.wikiquoteUrl}
                target="_blank"
                rel="noreferrer"
              >
                {quote.sourceTitle}
              </a>
            </cite>
          </div>
        </div>
        <ol className="ff-empty-darkroom__process" aria-label="暗房流程">
          {PROCESS_NOTES.map(note => <li key={note}>{note}</li>)}
        </ol>
      </div>

      {isDragActive ? (
        <div className="absolute inset-3 z-10 flex items-center justify-center rounded-[4px] border border-[var(--ff-amber)] bg-[color:var(--ff-bg)]/95 shadow-[var(--ff-shadow-contact)]" role="status">
          <span className="inline-flex items-center gap-2 text-lg text-[var(--ff-amber)]">
            <UploadIcon size={18} />松开以加入这一卷
          </span>
        </div>
      ) : null}
    </section>
  );
}

export default EmptyDarkroom;
