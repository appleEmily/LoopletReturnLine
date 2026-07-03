import { NextResponse } from 'next/server'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export async function POST(req: Request) {
  const dashboardBaseUrl = process.env.LOOPLET_DASHBOARD_BASE_URL
  if (!dashboardBaseUrl) {
    return NextResponse.json(
      { error: 'LOOPLET_DASHBOARD_BASE_URL が未設定です' },
      { status: 500 },
    )
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json(
      { error: 'リクエストボディが無効です' },
      { status: 400 },
    )
  }

  const images = formData.getAll('images').filter((value) => value instanceof File)
  for (const image of images) {
    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        {
          error: `「${image.name || 'photo.jpg'}」は10MBを超えています。各画像は10MB以下にしてください`,
        },
        { status: 400 },
      )
    }
  }

  const url = new URL('/api/return-requests', dashboardBaseUrl)
  const headers = new Headers({ Accept: 'application/json' })
  const apiKey = process.env.LOOPLET_API_KEY
  if (apiKey) headers.set('X-API-Key', apiKey)

  let dashboardResponse: Response
  try {
    dashboardResponse = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
      cache: 'no-store',
    })
  } catch {
    return NextResponse.json(
      { error: 'Dashboard API に接続できませんでした' },
      { status: 502 },
    )
  }

  const text = await dashboardResponse.text()
  const contentType = dashboardResponse.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    try {
      return NextResponse.json(JSON.parse(text), {
        status: dashboardResponse.status,
      })
    } catch {
      return NextResponse.json(
        { error: 'Dashboard API のJSONレスポンスを読み取れませんでした' },
        { status: 502 },
      )
    }
  }

  return new NextResponse(text, {
    status: dashboardResponse.status,
    headers: { 'Content-Type': contentType || 'text/plain; charset=utf-8' },
  })
}
