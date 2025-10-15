# eBird Life List Optimizer

A React web application that helps birders optimize their birding trips by analyzing eBird hotspots and recommending locations with the highest probability of seeing new species.

## Features

- 🗺️ **Hotspot Discovery**: Automatically fetches birding hotspots in the Chicago West Side area
- 🐦 **Species Analysis**: Analyzes recent observations to calculate species frequency
- 📊 **Smart Recommendations**: Ranks locations based on expected new species and distance
- 🎯 **Probability Scoring**: Uses statistical analysis to predict likelihood of seeing new birds
- 🚀 **Interactive Pipeline**: Step-by-step workflow with visual progress tracking

## Getting Started

### Prerequisites

- Node.js 18+ installed
- An eBird API key (free) from [ebird.org/api/keygen](https://ebird.org/api/keygen)

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd bird-optimizer
```

2. Install dependencies:
```bash
npm install
```

3. (Optional) Create a `.env.local` file with your API key:
```bash
cp .env.local.example .env.local
# Edit .env.local and add your eBird API key
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

1. **Enter API Key**: Get your free API key from eBird and enter it in the app (or set it in `.env.local`)
2. **Fetch Hotspots**: Click to load birding hotspots in the Chicago West Side area
3. **Fetch Species Data**: Process recent observations from each hotspot
4. **Add Life List**: Use the demo button to add common birds, or customize your own list
5. **Get Recommendations**: View ranked hotspots with probability scores for new species

## Deployment on Vercel

This app is optimized for Vercel deployment:

1. Push your code to GitHub
2. Import the project in [Vercel](https://vercel.com)
3. Deploy! No additional configuration needed

The app will automatically:
- Build with Next.js
- Optimize for production
- Deploy to a global CDN

## Technology Stack

- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **Lucide React**: Beautiful icons
- **eBird API**: Real-time birding data

## Customization

To change the search region, modify the `CHICAGO_WEST` object in `app/page.tsx`:

```typescript
const CHICAGO_WEST = {
  name: "Your Region Name",
  lat: 41.88,    // Latitude
  lng: -87.75,   // Longitude
  radius: 25     // Search radius in km
};
```

## API Rate Limits

The app includes built-in rate limiting (200ms delay between requests) to respect eBird API guidelines. For production use with many hotspots, consider implementing additional caching.

## License

See LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
