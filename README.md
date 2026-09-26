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

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

### Required environment variables

Room images are uploaded to Cloudinary because Vercel's filesystem is ephemeral. Create a Cloudinary account and add these variables to `.env` locally and to the Vercel project settings:

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

The room image upload endpoint accepts image files up to 4 MB and stores their Cloudinary secure URL and public ID in the room record.

### Connect Gmail for reservation emails

Enable the Gmail API in Google Cloud, configure the OAuth consent screen, and create an OAuth client with application type **Web application**. Add the exact value of `GOOGLE_REDIRECT_URI` to the client's authorized redirect URIs. For local development, use `http://localhost:3000/api/gmail/callback`; add the production callback URL separately for the deployed site. If the OAuth app is in testing mode, add the Gmail account as a test user.

Set these values in `.env` locally and in the Vercel project environment settings:

```env
GOOGLE_CLIENT_ID=your_google_oauth_web_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_web_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/gmail/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=generate_a_64_character_hex_key
```

Generate the encryption key locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Keep the client secret and encryption key private, and use the same encryption key anywhere this deployment reads its saved Gmail connection. An owner can then connect Gmail from Reservation Management; staff and owners can send generated reservation emails from a reservation's edit view.

### Seed the production database

Vercel should only run `npm run build` during deployment. Run the initial database seed separately from your local terminal after adding the production `MONGODB_URI` to your local `.env`:

```bash
npm run seed:all
```

The seed scripts upsert the default user, lookup records, rooms, promos, and add-ons. Do not put `npm run seed:all` in the Vercel build command, since builds can run repeatedly.
