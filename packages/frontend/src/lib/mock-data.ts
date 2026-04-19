import { ApiStatus, type ApiListingPublic } from "@chain-lens/shared";

export const mockApis: ApiListingPublic[] = [
  {
    id: "mock-1",
    onChainId: 1,
    name: "Weather API",
    description:
      "Get real-time weather data for any city worldwide. Returns temperature, humidity, wind speed, and weather conditions.",
    price: "10000000000000000",
    category: "data",
    sellerAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    status: ApiStatus.APPROVED,
    exampleRequest: { city: "Seoul", unit: "celsius" },
    exampleResponse: {
      temperature: 23,
      humidity: 65,
      wind_speed: 12,
      condition: "Partly Cloudy",
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "mock-2",
    onChainId: 2,
    name: "GPT Summarizer",
    description:
      "Summarize any text using GPT-4. Supports articles, papers, and documents up to 10,000 words.",
    price: "50000000000000000",
    category: "ai",
    sellerAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    status: ApiStatus.APPROVED,
    exampleRequest: {
      text: "Long article text here...",
      max_length: 200,
    },
    exampleResponse: {
      summary: "This article discusses the impact of AI on...",
      word_count: 45,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "mock-3",
    onChainId: 3,
    name: "Token Price Oracle",
    description:
      "Fetch real-time token prices from multiple DEXs on Base. Supports ETH, USDC, WETH, and 50+ tokens.",
    price: "5000000000000000",
    category: "finance",
    sellerAddress: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    status: ApiStatus.APPROVED,
    exampleRequest: { token: "ETH", quote: "USDC" },
    exampleResponse: {
      price: 2.45,
      volume_24h: 15000000,
      change_24h: 3.2,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "mock-4",
    onChainId: 4,
    name: "Image Generation API",
    description:
      "Generate images from text prompts using Stable Diffusion XL. Returns high-quality 1024x1024 images.",
    price: "100000000000000000",
    category: "ai",
    sellerAddress: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    status: ApiStatus.APPROVED,
    exampleRequest: {
      prompt: "A futuristic city on Base blockchain",
      style: "digital art",
    },
    exampleResponse: {
      image_url: "https://example.com/generated/abc123.png",
      seed: 42,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "mock-5",
    onChainId: 5,
    name: "Sentiment Analysis",
    description:
      "Analyze sentiment of social media posts, reviews, or any text. Returns positive/negative/neutral scores.",
    price: "8000000000000000",
    category: "ai",
    sellerAddress: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
    status: ApiStatus.APPROVED,
    exampleRequest: { text: "Base is the fastest L2 blockchain!" },
    exampleResponse: {
      sentiment: "positive",
      confidence: 0.92,
      scores: { positive: 0.92, neutral: 0.06, negative: 0.02 },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "mock-6",
    onChainId: 6,
    name: "NFT Metadata API",
    description:
      "Fetch and verify NFT metadata from any EVM chain. Supports ERC-721 and ERC-1155 standards.",
    price: "3000000000000000",
    category: "data",
    sellerAddress: "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
    status: ApiStatus.APPROVED,
    exampleRequest: {
      chain: "base",
      contract: "0x1234...abcd",
      tokenId: 1,
    },
    exampleResponse: {
      name: "Cool NFT #1",
      image: "ipfs://Qm...",
      attributes: [{ trait_type: "Rarity", value: "Legendary" }],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];
