'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Step = 'form' | 'camera' | 'confirm' | 'done'

type CapturedPhoto = {
  id: string
  file: File
  url: string
}

type SubmitResult =
  | { ok: true; id: string; locationName: string; loopletQuantity: number }
  | { ok: false; message: string }

type LiffProfile = {
  userId?: string
  displayName?: string
}

type LiffClient = {
  init: (input: { liffId: string }) => Promise<void>
  isLoggedIn: () => boolean
  login: () => void
  getProfile: () => Promise<LiffProfile>
}

declare global {
  interface Window {
    liff?: LiffClient
  }
}

function getQueryParam(name: string) {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get(name)?.trim() || ''
}

function createPhotoFileName(index: number) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `looplet-return-${stamp}-${index}.jpg`
}

async function loadLiffSdk() {
  if (window.liff) return

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-looplet-liff]',
    )
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js'
    script.async = true
    script.dataset.loopletLiff = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject()
    document.head.appendChild(script)
  })
}

export function ReturnFlow() {
  const [step, setStep] = useState<Step>('form')
  const [locationId, setLocationId] = useState('')
  const [locationName, setLocationName] = useState('')
  const [brandName, setBrandName] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [remarks, setRemarks] = useState('')
  const [photos, setPhotos] = useState<CapturedPhoto[]>([])
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [profile, setProfile] = useState<LiffProfile | null>(null)

  useEffect(() => {
    setLocationId(getQueryParam('locationId'))
    setLocationName(
      getQueryParam('locationName') ||
        process.env.NEXT_PUBLIC_DEFAULT_LOCATION_NAME ||
        '',
    )
    setBrandName(
      getQueryParam('brandName') ||
        process.env.NEXT_PUBLIC_DEFAULT_BRAND_NAME ||
        'chom Inc.',
    )
  }, [])

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID
    if (!liffId) return
    const configuredLiffId = liffId

    let cancelled = false

    async function initializeLiff() {
      try {
        await loadLiffSdk()
        await window.liff?.init({ liffId: configuredLiffId })
        if (!window.liff?.isLoggedIn()) {
          window.liff?.login()
          return
        }
        const userProfile = await window.liff?.getProfile()
        if (!cancelled && userProfile) setProfile(userProfile)
      } catch {
        if (!cancelled) setError('LINE連携を初期化できませんでした')
      }
    }

    initializeLiff()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => {
      photos.forEach((photo) => URL.revokeObjectURL(photo.url))
    }
  }, [photos])

  const canProceed = useMemo(
    () => Boolean(locationId && locationName && quantity > 0),
    [locationId, locationName, quantity],
  )

  const addPhoto = useCallback((file: File) => {
    setPhotos((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
      },
    ])
  }, [])

  const removeLastPhoto = useCallback(() => {
    setPhotos((current) => {
      const next = [...current]
      const removed = next.pop()
      if (removed) URL.revokeObjectURL(removed.url)
      return next
    })
  }, [])

  async function submitReturnRequest() {
    if (!canProceed) {
      setError('返却元の店舗情報と返却数を確認してください')
      return
    }
    if (photos.length === 0) {
      setError('返却状態が分かる写真を1枚以上撮影してください')
      return
    }

    setIsSubmitting(true)
    setError('')

    const formData = new FormData()
    formData.set('locationId', locationId)
    formData.set('loopletQuantity', String(quantity))
    formData.set(
      'remarks',
      [
        remarks.trim(),
        profile?.displayName ? `LINE: ${profile.displayName}` : '',
        profile?.userId ? `LINE userId: ${profile.userId}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    photos.forEach((photo) => formData.append('images', photo.file))

    try {
      const response = await fetch('/api/return-requests', {
        method: 'POST',
        body: formData,
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        setResult({
          ok: false,
          message: payload?.error || '返却申請の送信に失敗しました',
        })
        setStep('done')
        return
      }

      setResult({
        ok: true,
        id: payload.id,
        locationName: payload.locationName || locationName,
        loopletQuantity: payload.loopletQuantity || quantity,
      })
      setStep('done')
    } catch {
      setResult({
        ok: false,
        message: '通信に失敗しました。時間をおいて再度お試しください。',
      })
      setStep('done')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (step === 'camera') {
    return (
      <CameraStep
        photos={photos}
        onCapture={addPhoto}
        onBack={() => setStep('form')}
        onNext={() => setStep('confirm')}
        onRemoveLast={removeLastPhoto}
      />
    )
  }

  if (step === 'confirm' || step === 'done') {
    return (
      <main className="app">
        <section className="screen submit-screen">
          <h1 className="title">
            {step === 'done' ? '送信結果' : '返却内容の確認'}
          </h1>
          <div className="summary-card">
            <div className="summary-row">
              <span>返却ブランド</span>
              <strong>{brandName}</strong>
            </div>
            <div className="summary-row">
              <span>店舗</span>
              <strong>{locationName}</strong>
            </div>
            <div className="summary-row">
              <span>返却数</span>
              <strong>{quantity}</strong>
            </div>
            <div className="summary-row">
              <span>写真</span>
              <strong>{photos.length}枚</strong>
            </div>
          </div>

          {step === 'done' && result ? (
            <div className={`result ${result.ok ? 'ok' : 'error'}`}>
              {result.ok ? (
                <>
                  返却申請を送信しました。
                  <br />
                  申請ID: {result.id}
                </>
              ) : (
                result.message
              )}
            </div>
          ) : (
            <>
              {error ? <p className="inline-error">{error}</p> : null}
              <button
                className="primary-button"
                disabled={isSubmitting}
                onClick={submitReturnRequest}
              >
                {isSubmitting ? '送信中...' : 'Dashboardへ送信'}
              </button>
              <button
                className="secondary-button"
                disabled={isSubmitting}
                onClick={() => setStep('camera')}
              >
                写真を撮り直す
              </button>
              <button
                className="secondary-button"
                disabled={isSubmitting}
                onClick={() => setStep('form')}
              >
                入力に戻る
              </button>
            </>
          )}
        </section>
      </main>
    )
  }

  return (
    <main className="app">
      <section className="screen return-screen">
        <h1 className="title">返却情報</h1>

        <div className="info-list">
          <div className="info-row">
            <span className="info-label">返却ブランド</span>
            <span className="info-value text">{brandName}</span>
          </div>
          <label className="info-row">
            <span className="info-label">店舗</span>
            <input
              className="info-value"
              value={locationName}
              placeholder="店舗名"
              onChange={(event) => setLocationName(event.target.value)}
            />
          </label>
          <div className="info-row">
            <span className="info-label">返却数</span>
            <div className="quantity-control">
              <button
                className="icon-button"
                aria-label="返却数を減らす"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              >
                -
              </button>
              <input
                className="quantity-input"
                inputMode="numeric"
                pattern="[0-9]*"
                value={quantity}
                aria-label="返却数"
                onChange={(event) => {
                  const value = Number(event.target.value.replace(/\D/g, ''))
                  setQuantity(Number.isFinite(value) && value > 0 ? value : 1)
                }}
              />
              <button
                className="icon-button"
                aria-label="返却数を増やす"
                onClick={() => setQuantity((value) => value + 1)}
              >
                +
              </button>
            </div>
          </div>
          <textarea
            className="remarks"
            value={remarks}
            placeholder="備考"
            onChange={(event) => setRemarks(event.target.value)}
          />
        </div>

        {!locationId ? (
          <p className="inline-error">
            URLに locationId がありません。店舗ごとのLIFF URLに
            locationIdを付与してください。
          </p>
        ) : null}
        {error ? <p className="inline-error">{error}</p> : null}

        <button
          className="primary-button"
          disabled={!canProceed}
          onClick={() => {
            setError('')
            setStep('camera')
          }}
        >
          写真撮影へ進む &gt;
        </button>
      </section>
    </main>
  )
}

function CameraStep({
  photos,
  onCapture,
  onBack,
  onNext,
  onRemoveLast,
}: {
  photos: CapturedPhoto[]
  onCapture: (file: File) => void
  onBack: () => void
  onNext: () => void
  onRemoveLast: () => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState('')

  useEffect(() => {
    let activeStream: MediaStream | null = null

    async function startCamera() {
      try {
        const nextStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1440 },
            height: { ideal: 1920 },
          },
        })
        activeStream = nextStream
        setStream(nextStream)
        if (videoRef.current) {
          videoRef.current.srcObject = nextStream
          await videoRef.current.play()
        }
      } catch {
        setCameraError('カメラを起動できません。写真選択から撮影してください。')
      }
    }

    startCamera()

    return () => {
      activeStream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  async function captureFromVideo() {
    const video = videoRef.current
    if (!video || !stream) {
      fileInputRef.current?.click()
      return
    }

    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) {
      fileInputRef.current?.click()
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return

    context.drawImage(video, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.86),
    )
    if (!blob) return

    onCapture(
      new File([blob], createPhotoFileName(photos.length + 1), {
        type: 'image/jpeg',
      }),
    )
  }

  return (
    <main className="camera-screen">
      <video
        ref={videoRef}
        className="camera-video"
        muted
        playsInline
        autoPlay
      />
      <input
        ref={fileInputRef}
        className="file-fallback"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onCapture(file)
          event.target.value = ''
        }}
      />

      <div className="focus-frame" aria-hidden="true">
        <span className="corner tl" />
        <span className="corner tr" />
        <span className="corner bl" />
        <span className="corner br" />
      </div>

      <div className="photo-strip" aria-label="撮影済み写真">
        {photos.slice(-3).map((photo) => (
          <div className="thumb" key={photo.id}>
            <img src={photo.url} alt="" />
          </div>
        ))}
      </div>

      <div className="camera-overlay">
        <p className="camera-copy">
          枠内にLoopletを収めてください。
          <br />
          Looplet内にLoopletを入れている場合は、
          <br />
          中が見える形で撮影してください。
        </p>

        {cameraError ? <p className="inline-error">{cameraError}</p> : null}

        <div className="camera-actions">
          <button className="camera-side-button" onClick={onBack}>
            戻る
          </button>
          <button
            className="shutter"
            aria-label="写真を撮影"
            onClick={captureFromVideo}
          />
          <button
            className="camera-side-button"
            disabled={photos.length === 0}
            onClick={onNext}
          >
            次へ
          </button>
        </div>
        <div className="camera-actions">
          <button
            className="camera-side-button"
            onClick={() => fileInputRef.current?.click()}
          >
            写真選択
          </button>
          <span />
          <button
            className="camera-side-button"
            disabled={photos.length === 0}
            onClick={onRemoveLast}
          >
            削除
          </button>
        </div>
      </div>
    </main>
  )
}
