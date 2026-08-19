This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Typography

No webfont is loaded. The type stacks in `app/globals.css` are Apple's own
production chain — San Francisco (`-apple-system`, `SF Pro Text`, `SF Pro
Display`, `SF Mono`), then Helvetica Neue, Helvetica, Arial — so the app renders
in the genuine system face on Apple hardware.

San Francisco is licensed for Apple-platform UI only and has no webfont
distribution, so it cannot be self-hosted or hotlinked. To get it on Windows or
Linux, install **SF Pro** from
[Apple's developer font downloads](https://developer.apple.com/fonts/) (free).
The stacks already name it, so it takes effect with no code change. Without it
the app falls back to Helvetica/Arial, which is what apple.com serves those
same visitors.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
