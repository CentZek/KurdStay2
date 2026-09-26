import { authenticateUser } from "../_shared/session.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, X-Stay-Session, X-Stay-Visitor",
};

interface ExtractedRoomType {
  name: string;
  description: string;
  max_guests: number;
  base_price: number;
  amenities: string[];
  images: string[];
}

interface ExtractedHotel {
  name: string;
  description: string;
  property_type: string;
  city: string;
  country: string;
  address: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  amenities: string[];
  phone: string | null;
  images: string[];
  star_rating: number | null;
  check_in_time: string | null;
  check_out_time: string | null;
  room_types: ExtractedRoomType[];
}

function deduplicateAmenities(amenities: string[]): string[] {
  // Groups of equivalent terms - keep only the first match found
  const equivalenceGroups = [
    ["Free WiFi", "WiFi", "Internet", "Wireless Internet"],
    ["Free Parking", "Parking", "Free Private Parking", "Private Parking", "On-site Parking"],
    ["Outdoor Pool", "Pool", "Swimming Pool"],
    ["Indoor Pool"],
    ["Fitness Center", "Gym", "Fitness Room", "Fitness"],
    ["Spa", "Wellness Center", "Spa and Wellness Center", "Spa & Wellness"],
    ["Hot Tub", "Jacuzzi", "Whirlpool"],
    ["Flat-screen TV", "TV", "Television", "Flat Screen TV"],
    ["Mini Bar", "Minibar"],
    ["Hair Dryer", "Hairdryer"],
    ["Air Conditioning", "AC", "A/C", "Climate Control"],
    ["24h Reception", "24-Hour Front Desk", "24h Front Desk", "24-Hour Reception"],
    ["Non-smoking Rooms", "Non-Smoking Rooms", "Non Smoking Rooms"],
    ["Room Service", "In-Room Dining"],
    ["Laundry", "Laundry Service"],
    ["Dry Cleaning", "Dry Cleaning Service"],
    ["Airport Shuttle", "Free Airport Shuttle", "Shuttle Service"],
    ["Luggage Storage", "Baggage Storage"],
    ["Desk", "Work Desk", "Writing Desk"],
    ["Bathrobe", "Bathrobes"],
    ["Slippers", "Complimentary Slippers"],
    ["Toiletries", "Free Toiletries", "Complimentary Toiletries"],
  ];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const amenity of amenities) {
    const normalized = amenity.trim();
    if (!normalized) continue;

    const lower = normalized.toLowerCase();

    // Check if this belongs to an equivalence group where we already picked one
    let isDuplicate = false;
    for (const group of equivalenceGroups) {
      const groupLower = group.map((g) => g.toLowerCase());
      if (groupLower.includes(lower)) {
        // Check if any item from this group is already in results
        if (groupLower.some((g) => seen.has(g))) {
          isDuplicate = true;
          break;
        }
        seen.add(lower);
        break;
      }
    }

    if (isDuplicate) continue;

    // Simple exact-match dedup
    if (seen.has(lower)) continue;
    seen.add(lower);

    result.push(normalized);
  }

  return result.slice(0, 35);
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extractNameFromUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;

    // Airbnb: /rooms/12345 - name not in URL, return null
    if (parsedUrl.hostname.includes("airbnb")) {
      return null;
    }

    // Booking.com: /hotel/iq/hotel-name-here
    const match = pathname.match(/\/hotel\/[^/]+\/([^/.]+)/);
    if (match) {
      return match[1]
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
    }
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      const last = segments[segments.length - 1].replace(/\.html?$/, "");
      if (last.length > 3 && !/^\d+$/.test(last)) {
        return last
          .replace(/[-_]+/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
          .trim();
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function extractRelevantSections(fullText: string): string {
  const lines = fullText.split("\n");
  const sections: { priority: number; content: string }[] = [];

  // Keywords that indicate important hotel sections
  const facilityKeywords =
    /facilit|ameniti|service|feature|popular|most popular|free wifi|parking|pool|gym|spa|restaurant|breakfast|what this place offers|property amenities|hotel amenities|kitchen|workspace|outdoor|entertainment/i;
  const roomKeywords =
    /room type|room name|availability|select room|double room|single room|twin room|suite|deluxe|standard|superior|king bed|queen bed|occupancy|per night|price|\$\d|\€\d|USD|EUR|IQD|guests?\s*\d|sleeps\s*\d|bed configuration|bedroom|bathroom|total before taxes|cleaning fee|service fee|night|nightly/i;
  const locationKeywords =
    /location|address|neighborhood|area|district|directions|how to get|nearby|surroundings|where you.?ll be/i;
  const policyKeywords =
    /check.?in|check.?out|house rules|policies|cancellation|children|pets|smoking/i;
  const ratingKeywords =
    /rating|score|review|stars|guest review|exceptional|superb|very good|good|pleasant/i;

  let currentSection = "";
  let currentPriority = 3; // default low priority

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentSection.length > 20) {
        sections.push({ priority: currentPriority, content: currentSection });
      }
      currentSection = "";
      currentPriority = 3;
      continue;
    }

    // Detect section type by keywords
    if (facilityKeywords.test(trimmed)) {
      currentPriority = Math.min(currentPriority, 1);
    } else if (roomKeywords.test(trimmed)) {
      currentPriority = Math.min(currentPriority, 1);
    } else if (locationKeywords.test(trimmed)) {
      currentPriority = Math.min(currentPriority, 1);
    } else if (policyKeywords.test(trimmed)) {
      currentPriority = Math.min(currentPriority, 2);
    } else if (ratingKeywords.test(trimmed)) {
      currentPriority = Math.min(currentPriority, 2);
    }

    currentSection += trimmed + "\n";
  }

  if (currentSection.length > 20) {
    sections.push({ priority: currentPriority, content: currentSection });
  }

  // Sort by priority (1 = highest) then take content up to limit
  sections.sort((a, b) => a.priority - b.priority);

  let result = "";
  const limit = 50000;
  for (const section of sections) {
    if (result.length + section.content.length > limit) {
      const remaining = limit - result.length;
      if (remaining > 200) {
        result += section.content.substring(0, remaining) + "\n";
      }
      break;
    }
    result += section.content + "\n";
  }

  return result;
}

async function fetchPageContent(
  url: string,
): Promise<{ content: string; method: string }> {
  let fetchUrl = url;
  const isAirbnb = url.includes("airbnb.");
  const isBooking = url.includes("booking.com");

  // Ensure Booking.com URLs have check-in/check-out dates (required to show room prices)
  if (isBooking && !url.includes("checkin=") && !url.includes("check_in=")) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(today);
    dayAfter.setDate(dayAfter.getDate() + 2);
    const checkin = tomorrow.toISOString().split("T")[0];
    const checkout = dayAfter.toISOString().split("T")[0];
    const sep = url.includes("?") ? "&" : "?";
    fetchUrl = `${url}${sep}checkin=${checkin}&checkout=${checkout}&group_adults=2&no_rooms=1`;
  }

  // For Airbnb, ensure dates are present for pricing
  if (isAirbnb && !url.includes("check_in=") && !url.includes("checkin=")) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(today);
    dayAfter.setDate(dayAfter.getDate() + 2);
    const checkin = tomorrow.toISOString().split("T")[0];
    const checkout = dayAfter.toISOString().split("T")[0];
    const sep = url.includes("?") ? "&" : "?";
    fetchUrl = `${url}${sep}check_in=${checkin}&check_out=${checkout}&adults=2`;
  }

  const waitSelector = isBooking
    ? "#hprt-table, [data-testid='property-section--room'], .hprt-table"
    : isAirbnb
    ? "[data-section-id='AMENITIES'], [data-section-id='BOOK_IT_SIDEBAR'], [data-plugin-in-point-id='BOOK_IT_SIDEBAR']"
    : "";

  // Try Jina Reader API first (renders JS like Chrome)
  try {
    const headers: Record<string, string> = {
      Accept: "text/plain",
      "X-Return-Format": "markdown",
      "X-Timeout": "45",
    };
    if (waitSelector) {
      headers["X-Wait-For-Selector"] = waitSelector;
    }
    const jinaResponse = await fetchWithTimeout(
      `https://r.jina.ai/${fetchUrl}`,
      { headers },
      50000,
    );
    if (jinaResponse.ok) {
      const text = await jinaResponse.text();
      if (text.length > 500) {
        const processed = extractRelevantSections(text);
        return { content: processed, method: "jina" };
      }
    }
  } catch {
    // Jina unavailable or timed out
  }

  // Second attempt with Jina - simpler request without wait-for
  try {
    const jinaResponse = await fetchWithTimeout(
      `https://r.jina.ai/${fetchUrl}`,
      {
        headers: {
          Accept: "text/plain",
          "X-Return-Format": "text",
          "X-Timeout": "30",
        },
      },
      35000,
    );
    if (jinaResponse.ok) {
      const text = await jinaResponse.text();
      if (text.length > 500) {
        const processed = extractRelevantSections(text);
        return { content: processed, method: "jina-fallback" };
      }
    }
  } catch {
    // Jina unavailable
  }

  // Fallback: direct fetch (works for some pages without heavy JS)
  const pageResponse = await fetchWithTimeout(
    fetchUrl,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "identity",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
    },
    20000,
  );

  if (!pageResponse.ok) {
    throw new Error(`Failed to fetch page: ${pageResponse.status}`);
  }

  const html = await pageResponse.text();
  return { content: extractStructuredContent(html), method: "direct" };
}

function extractStructuredContent(html: string): string {
  const parts: string[] = [];

  // JSON-LD structured data (critical for Booking.com - contains lat/lng, address, ratings)
  const jsonLdMatches = html.match(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  if (jsonLdMatches) {
    for (const match of jsonLdMatches) {
      const content = match
        .replace(/<script[^>]*>/, "")
        .replace(/<\/script>/, "")
        .trim();
      if (content.length > 10) {
        parts.push("STRUCTURED DATA:\n" + content.substring(0, 12000));
      }
    }
  }

  // Extract image URLs from the HTML
  const imageUrls: string[] = [];
  // Booking.com images
  const imgRegex =
    /(?:data-highres|data-lazy|src)=["'](https:\/\/cf\.bstatic\.com\/xdata\/images\/hotel\/max\d+\/[^"']+)["']/gi;
  let imgMatch;
  while ((imgMatch = imgRegex.exec(html)) !== null && imageUrls.length < 30) {
    const imgUrl = imgMatch[1];
    if (!imageUrls.includes(imgUrl)) {
      imageUrls.push(imgUrl);
    }
  }
  // Also try square format images
  const imgRegex2 =
    /(?:data-highres|data-lazy|src)=["'](https:\/\/cf\.bstatic\.com\/xdata\/images\/hotel\/square\d+\/[^"']+)["']/gi;
  while (
    (imgMatch = imgRegex2.exec(html)) !== null && imageUrls.length < 30
  ) {
    const imgUrl = imgMatch[1]
      .replace(/square\d+/, "max1024x768");
    if (!imageUrls.includes(imgUrl)) {
      imageUrls.push(imgUrl);
    }
  }
  // Airbnb images
  const airbnbImgRegex = /["'](https:\/\/a0\.muscache\.com\/im\/(?:pictures|ml-photo-list|photo-hosting)\/[^"']+)["']/gi;
  while ((imgMatch = airbnbImgRegex.exec(html)) !== null && imageUrls.length < 30) {
    const imgUrl = imgMatch[1].split('?')[0] + '?im_w=720';
    if (!imageUrls.some(u => u.split('?')[0] === imgUrl.split('?')[0])) {
      imageUrls.push(imgUrl);
    }
  }
  if (imageUrls.length > 0) {
    parts.push("IMAGE URLS:\n" + imageUrls.join("\n"));
  }

  // Meta tags
  const metaTags: string[] = [];
  const metaRegex = /<meta[^>]+>/gi;
  let metaMatch;
  while ((metaMatch = metaRegex.exec(html)) !== null) {
    const tag = metaMatch[0];
    const nameMatch = tag.match(/(?:property|name)=["']([^"']+)["']/);
    const contentMatch = tag.match(/content=["']([^"']+)["']/);
    if (nameMatch && contentMatch && contentMatch[1].length > 2) {
      metaTags.push(`${nameMatch[1]}: ${contentMatch[1]}`);
    }
  }
  if (metaTags.length > 0) {
    parts.push("META TAGS:\n" + metaTags.join("\n"));
  }

  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    parts.push("TITLE: " + titleMatch[1].trim());
  }

  // Extract specific Booking.com data attributes and sections
  const facilityPatterns = [
    /class=["'][^"']*(?:facility|amenity|feature|popular)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section|ul)>/gi,
    /data-testid=["'][^"']*(?:facility|amenity|property-section)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section)>/gi,
    /class=["'][^"']*hp-description[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section)>/gi,
    /class=["'][^"']*(?:hprt|room[-_]?type|room[-_]?list|room[-_]?table|available[-_]?room|rt[-_]?bed)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section|table|tr)>/gi,
    /data-testid=["'][^"']*(?:room|availability|price|occupancy)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section|span|td)>/gi,
    /class=["'][^"']*(?:price|rate|cost|per.?night)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|span|td)>/gi,
  ];
  
  const facilityTexts: string[] = [];
  for (const pattern of facilityPatterns) {
    const matches = html.match(pattern);
    if (matches) {
      for (const match of matches) {
        const text = match
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (text.length > 20 && text.length < 8000) {
          facilityTexts.push(text);
        }
      }
    }
  }
  if (facilityTexts.length > 0) {
    parts.push(
      "FACILITIES/ROOMS/PRICING SECTION:\n" +
        facilityTexts.join("\n").substring(0, 15000),
    );
  }

  // Page text (stripped HTML tags)
  let textContent = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (textContent.length > 20000) {
    textContent = textContent.substring(0, 20000);
  }
  if (textContent.length > 100) {
    parts.push("PAGE TEXT:\n" + textContent);
  }

  let result = parts.join("\n\n---\n\n");
  if (result.length > 50000) {
    result = result.substring(0, 50000);
  }
  return result;
}

function extractImagesFromHtml(html: string, source: 'booking' | 'airbnb' | 'unknown' = 'unknown'): string[] {
  const imageUrls: string[] = [];

  if (source === 'airbnb' || source === 'unknown') {
    // Airbnb images (muscache.com CDN - multiple path patterns)
    const airbnbPatterns = [
      /https:\/\/a0\.muscache\.com\/im\/pictures\/[^\s"'<>)}\]]+/g,
      /https:\/\/a0\.muscache\.com\/im\/ml-photo-list\/[^\s"'<>)}\]]+/g,
      /https:\/\/a0\.muscache\.com\/im\/photo-hosting\/[^\s"'<>)}\]]+/g,
      /https:\/\/a0\.muscache\.com\/pictures\/[^\s"'<>)}\]]+/g,
    ];
    for (const pattern of airbnbPatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null && imageUrls.length < 30) {
        let url = match[0].replace(/[\\)}\]"',;]+$/, '');
        // Remove query params and add large policy for good resolution
        const baseUrl = url.split('?')[0];
        if (!imageUrls.some(u => u.split('?')[0] === baseUrl)) {
          imageUrls.push(baseUrl + '?im_w=720');
        }
      }
    }
  }

  if (source === 'booking' || (source === 'unknown' && imageUrls.length === 0)) {
    // Booking.com high-res hotel images
    const patterns = [
      /https:\/\/cf\.bstatic\.com\/xdata\/images\/hotel\/max\d+\/\d+\.\w+/g,
      /https:\/\/cf\.bstatic\.com\/xdata\/images\/hotel\/square\d+\/\d+\.\w+/g,
      /https:\/\/cf\.bstatic\.com\/static\/img\/[^\s"'<>]+/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null && imageUrls.length < 30) {
        let url = match[0];
        url = url.replace(/\/square\d+\//, "/max1024x768/");
        url = url.replace(/\/max\d+x?\d*\//, "/max1024x768/");
        if (!imageUrls.includes(url)) {
          imageUrls.push(url);
        }
      }
    }
  }

  return imageUrls;
}

function processRawHtmlContent(html: string, source: 'booking' | 'airbnb' | 'unknown' = 'unknown'): {
  content: string;
  images: string[];
} {
  const images = extractImagesFromHtml(html, source);
  const content = extractStructuredContent(html);
  return { content, images };
}

async function callAI(
  content: string,
  urlHint: string | null,
  source: 'booking' | 'airbnb' | 'unknown' = 'unknown',
): Promise<ExtractedHotel> {
  const nameHint = urlHint
    ? `\nHINT - The hotel name from the URL is likely: "${urlHint}". Use this if you cannot find a clear name in the page content.\n`
    : "";

  const sourceContext = source === 'airbnb'
    ? 'Airbnb listing page'
    : source === 'booking'
    ? 'Booking.com page'
    : 'hotel/accommodation listing page';

  const imageHint = source === 'airbnb'
    ? 'muscache.com'
    : source === 'booking'
    ? 'cf.bstatic.com or bstatic.com'
    : 'the listing platform CDN';

  const roomHint = source === 'airbnb'
    ? `- room_types: For Airbnb, create ONE room type representing the entire listing.
  PRICING IS MANDATORY - you MUST extract the nightly price. Look for:
    - A price shown near "per night" or "/night"
    - A number preceded by $ or € or £ or a currency symbol
    - A total price divided by the number of nights
    - Text like "$150 night" or "€95 per night" or "IQD 120,000/night"
    - The price shown in the booking widget/card on the right side
    - If you see a total (e.g. "$450 total" for 3 nights), divide by the number of nights
  Set base_price to the nightly rate as a number (no currency symbol). NEVER leave base_price as 0 or null.
  For max_guests use the number of guests the listing accommodates (look for "X guests" near the top).
  Name it based on the property type (e.g. "Entire Villa", "Private Room", "Farm Stay", "Entire Apartment", "Entire Chalet").
  For description, include: number of bedrooms, bathrooms, beds mentioned.
  For amenities on the room_type, include all property-specific features (bedrooms, beds, bathrooms info).`
    : `- room_types: Extract ALL room/suite types listed on the page. For each room type:
  - name: The exact room name (e.g. "Deluxe Double Room", "Standard Twin Room", "Family Suite")
  - description: Brief description if available (bed type, view, etc.)
  - max_guests: Maximum number of guests (look for person icons/numbers)
  - base_price: Price per night in the displayed currency (just the number, no currency symbol). Use the lowest/base price shown.
  - amenities: Room-specific amenities (e.g. "Air Conditioning", "Flat-screen TV", "Mini Bar", "Balcony", "Sea View", "Private Bathroom", "Free WiFi", "Coffee Maker", "Safe", "Bathrobe"). Only include what is specifically listed for that room type.
  - images: Any room-specific image URLs if available
  
  IMPORTANT: Extract EVERY distinct room type. Booking.com typically shows them in a table/grid format. Different bed configurations of the same room ARE separate types (e.g. "Deluxe Room - King Bed" vs "Deluxe Room - Twin Beds").`;

  const res = await fetchWithTimeout(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.6-luna",
        messages: [
          {
            role: "system",
            content:
              "You are an expert at extracting structured hotel/accommodation data from webpage content. You return ONLY valid JSON. Never return explanations or markdown. Only output a single JSON object. Be thorough - extract ALL amenities and facilities mentioned on the page. IMPORTANT: If the page content is in German, Arabic, Kurdish, Turkish, or any non-English language, translate ALL extracted text (name, description, amenities, room names, etc.) into English.",
          },
          {
            role: "user",
            content: `Extract ALL accommodation information from this ${sourceContext} data. Return ONLY a JSON object (no markdown, no backticks, no text before/after):

{"name":"PROPERTY NAME","description":"Full description of the property (2-4 sentences)","property_type":"hotel","city":"CITY","country":"COUNTRY","address":"FULL STREET ADDRESS","location":"AREA/NEIGHBORHOOD/DISTRICT","latitude":null,"longitude":null,"amenities":["amenity1","amenity2"],"phone":null,"images":[],"star_rating":null,"check_in_time":null,"check_out_time":null,"room_types":[{"name":"Room Name","description":"Brief description","max_guests":2,"base_price":100,"amenities":["amenity1","amenity2"],"images":[]}]}

CRITICAL RULES:
- property_type: one of hotel, motel, apartment, villa, farm
${roomHint}

- amenities: This is the MOST IMPORTANT field. Extract the property's facilities and amenities.
  For Airbnb: Look for the "What this place offers" section - it lists ALL amenities. Also check for highlights near the top (e.g. "Self check-in", "Great location", "Free cancellation"). Include ALL items from "What this place offers" using standard names.
  For Booking.com: Look for "Most popular facilities", "Property amenities" sections.
  
  IMPORTANT DEDUPLICATION RULES:
  - Do NOT include duplicates. Each concept should appear ONLY ONCE.
  - Pick the MOST SPECIFIC version: "Free WiFi" NOT "WiFi" + "Free WiFi" + "Internet"
  - "Outdoor Pool" covers it - do NOT also add "Pool" or "Swimming Pool"
  - "Spa" covers it - do NOT also add "Wellness Center" or "Spa and Wellness Center"  
  - "Free Parking" covers it - do NOT also add "Parking" or "Free Private Parking"
  - "Fitness Center" OR "Gym" - pick one, not both
  - "Mini Bar" OR "Minibar" - pick one, not both
  - "Flat-screen TV" covers "TV" - only include the specific one
  - "Hot Tub" OR "Jacuzzi" - pick one, not both
  
  Use these standard names when possible:
  WiFi, Free WiFi, Parking, Free Parking, Paid Parking, Pool, Indoor Pool, Outdoor Pool, Gym, Fitness Center, Spa, Sauna, Steam Room, Restaurant, Bar, Room Service, Breakfast, Free Breakfast, Air Conditioning, Heating, Laundry, Dry Cleaning, Airport Shuttle, Free Airport Shuttle, Business Center, Meeting Rooms, Pet Friendly, Kids Club, Playground, Beach Access, Private Beach, Balcony, Kitchen, Kitchenette, TV, Flat-screen TV, Safe, Mini Bar, Hair Dryer, Iron, Coffee Maker, Kettle, Elevator, Wheelchair Accessible, 24h Reception, Garden, Terrace, Hot Tub, BBQ Facilities, Non-smoking Rooms, Smoking Area, Luggage Storage, Concierge, Currency Exchange, ATM, Gift Shop, Tennis Court, Golf Course, Water Sports, Bicycle Rental, Car Rental, Valet Parking, EV Charging, Rooftop, Mountain View, Sea View, City View, Soundproofing, Family Rooms, Suites, Private Entrance, Fireplace, Washing Machine, Dishwasher, Microwave, Refrigerator, Bathrobe, Slippers, Toiletries, Bathtub, Private Bathroom, Desk, Wardrobe
  
  A typical property has 10-25 unique amenities. Focus on PROPERTY-LEVEL amenities (things guests care about when choosing), not individual room furnishings.

- latitude/longitude: Look in structured data, JSON-LD, coordinates, geo data, or any numbers that look like lat/lng pairs
- images: Extract any image URLs found (especially from ${imageHint})
- star_rating: number 1-5 if found (look for star count, property class, rating)
- check_in_time / check_out_time: e.g. "14:00" / "12:00" if found
- description: Write a comprehensive property description from the content (mention location highlights, main features)
- phone: Include country code if available
- address: Full address including street number, street, area, postal code, city
- city: Just the city name
- country: Full country name
- location: Neighborhood, district, or area name
${nameHint}
WEBPAGE DATA:
${content}`,
          },
        ],
        temperature: 0.0,
        max_tokens: 10000,
      }),
    },
    45000,
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `AI service error (${res.status}): ${errText.substring(0, 200)}`,
    );
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content;

  if (!raw) {
    throw new Error("AI returned empty response");
  }

  let cleaned = raw.trim();
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error("AI response does not contain valid JSON");
  }
  cleaned = cleaned.substring(jsonStart, jsonEnd + 1);

  const parsed = JSON.parse(cleaned);
  if (!parsed.name && urlHint) {
    parsed.name = urlHint;
  }
  if (!parsed.name) {
    throw new Error("Could not identify the hotel name from the page content");
  }
  return parsed;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const user = await authenticateUser(req);
    if (user?.role !== "admin") return jsonResponse({ error: "Not authorized" }, 403);
    const body = await req.json();
    const { url, htmlContent } = body;

    if (!url && !htmlContent) {
      return jsonResponse(
        { error: "Provide either a URL or pasted HTML content" },
        400,
      );
    }

    let urlNameHint: string | null = null;
    if (url) {
      try {
        new URL(url);
      } catch {
        return jsonResponse({ error: "Invalid URL format" }, 400);
      }
      urlNameHint = extractNameFromUrl(url);
    }

    let pageContent: string;
    let extractedImages: string[] = [];
    let fetchMethod = "unknown";

    // Detect source platform
    const source: 'booking' | 'airbnb' | 'unknown' = url
      ? url.includes('airbnb.') ? 'airbnb' : url.includes('booking.com') ? 'booking' : 'unknown'
      : htmlContent && htmlContent.includes('muscache.com') ? 'airbnb' : htmlContent && htmlContent.includes('bstatic.com') ? 'booking' : 'unknown';

    if (htmlContent) {
      // User pasted HTML from Chrome - process directly (most reliable)
      fetchMethod = "html-paste";
      const processed = processRawHtmlContent(htmlContent, source);
      pageContent = processed.content;
      extractedImages = processed.images;
    } else {
      // Fetch from URL
      try {
        const fetchResult = await fetchPageContent(url);
        pageContent = fetchResult.content;
        fetchMethod = fetchResult.method;
        // Extract images from Jina markdown content too
        if (extractedImages.length === 0 && pageContent.length > 0) {
          const imgPatterns = source === 'airbnb'
            ? [
                /https:\/\/a0\.muscache\.com\/im\/pictures\/[^\s"'<>)}\]]+/g,
                /https:\/\/a0\.muscache\.com\/im\/ml-photo-list\/[^\s"'<>)}\]]+/g,
                /https:\/\/a0\.muscache\.com\/im\/photo-hosting\/[^\s"'<>)}\]]+/g,
                /https:\/\/a0\.muscache\.com\/pictures\/[^\s"'<>)}\]]+/g,
              ]
            : [/https:\/\/cf\.bstatic\.com\/xdata\/images\/hotel\/max\d+\/\d+\.\w+/g];
          for (const pat of imgPatterns) {
            let m;
            while ((m = pat.exec(pageContent)) !== null && extractedImages.length < 30) {
              let imgUrl = m[0].replace(/[)}\]\\,"';]+$/, '');
              if (source === 'booking') {
                imgUrl = imgUrl.replace(/\/max\d+x?\d*\//, "/max1024x768/");
              } else {
                // Airbnb: normalize to good resolution
                imgUrl = imgUrl.split('?')[0] + '?im_w=720';
              }
              if (!extractedImages.some(u => u.split('?')[0] === imgUrl.split('?')[0])) {
                extractedImages.push(imgUrl);
              }
            }
          }
        }
      } catch (err) {
        return jsonResponse(
          { error: `Could not fetch page: ${(err instanceof Error ? err.message : "Internal server error")}` },
          422,
        );
      }
    }

    if (pageContent.length < 50) {
      if (urlNameHint) {
        return jsonResponse({
          data: {
            name: urlNameHint,
            description: "",
            property_type: "hotel",
            city: "",
            country: "",
            address: "",
            location: "",
            latitude: null,
            longitude: null,
            amenities: [],
            phone: null,
            images: extractedImages,
            star_rating: null,
            check_in_time: null,
            check_out_time: null,
            room_types: [],
          },
        });
      }
      return jsonResponse(
        {
          error:
            "Could not extract meaningful content. Try pasting the page source from Chrome instead.",
        },
        422,
      );
    }

    // Extract hotel data with AI
    let extracted: ExtractedHotel;
    const roomHints = pageContent.match(/(?:double|single|twin|triple|suite|deluxe|standard|superior|family|king|queen)\s*(?:room|bed|suite)/gi);
    const priceHints = pageContent.match(/(?:US\$|EUR|\$|€|IQD)\s*\d+|\d+\s*(?:per night|\/night)/gi);

    try {
      extracted = await callAI(pageContent, urlNameHint, source);
    } catch (err) {
      if (urlNameHint) {
        return jsonResponse({
          data: {
            name: urlNameHint,
            description: "",
            property_type: "hotel",
            city: "",
            country: "",
            address: "",
            location: "",
            latitude: null,
            longitude: null,
            amenities: [],
            phone: null,
            images: extractedImages,
            star_rating: null,
            check_in_time: null,
            check_out_time: null,
            room_types: [],
          },
        });
      }
      return jsonResponse({ error: (err instanceof Error ? err.message : "Internal server error") }, 502);
    }

    // If no rooms found and it's a Booking.com URL, try a second fetch targeting the room section
    if (
      (!Array.isArray(extracted.room_types) || extracted.room_types.length === 0) &&
      url &&
      url.includes("booking.com")
    ) {
      try {
        // Try fetching the mobile version which has a simpler room layout
        let roomUrl = url.replace("www.booking.com", "m.booking.com");
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dayAfter = new Date(today);
        dayAfter.setDate(dayAfter.getDate() + 2);
        const checkin = tomorrow.toISOString().split("T")[0];
        const checkout = dayAfter.toISOString().split("T")[0];
        if (!roomUrl.includes("checkin=")) {
          const sep = roomUrl.includes("?") ? "&" : "?";
          roomUrl = `${roomUrl}${sep}checkin=${checkin}&checkout=${checkout}&group_adults=2&no_rooms=1&selected_currency=USD`;
        }

        const roomResponse = await fetchWithTimeout(
          `https://r.jina.ai/${roomUrl}`,
          {
            headers: {
              Accept: "text/plain",
              "X-Return-Format": "text",
              "X-Timeout": "45",
            },
          },
          50000,
        );

        if (roomResponse.ok) {
          const roomText = await roomResponse.text();
          if (roomText.length > 200) {
            // Ask AI to extract just room types from this content
            const roomRes = await fetchWithTimeout(
              "https://openrouter.ai/api/v1/chat/completions",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "openai/gpt-5.6-luna",
                  messages: [
                    {
                      role: "system",
                      content: "You extract room types from hotel page content. Return ONLY valid JSON array. No markdown, no explanation. If the content is in any non-English language, translate all room names, descriptions and amenities into English.",
                    },
                    {
                      role: "user",
                      content: `Extract ALL room/suite types from this hotel page. Return ONLY a JSON array:
[{"name":"Room Name","description":"Brief desc","max_guests":2,"base_price":100,"amenities":["amenity1"],"images":[]}]

Rules:
- Extract EVERY distinct room type mentioned
- base_price: price per night (just the number)
- max_guests: max occupancy (default 2)
- Different bed configurations = different room types
- If you find price in format like "US$120" use 120
- If absolutely no room types found, return []

PAGE CONTENT:
${roomText.substring(0, 20000)}`,
                    },
                  ],
                  temperature: 0.0,
                  max_tokens: 4000,
                }),
              },
              30000,
            );

            if (roomRes.ok) {
              const roomJson = await roomRes.json();
              const roomContent = roomJson?.choices?.[0]?.message?.content?.trim();
              if (roomContent) {
                const cleaned = roomContent.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
                try {
                  const rooms = JSON.parse(cleaned);
                  if (Array.isArray(rooms) && rooms.length > 0) {
                    extracted.room_types = rooms;
                  }
                } catch { /* ignore parse errors */ }
              }
            }
          }
        }
      } catch { /* second attempt failed, continue with what we have */ }
    }

    // Normalize the result
    const validTypes = ["hotel", "motel", "apartment", "villa", "farm"];

    // Merge extracted images: AI-found + regex-found
    const aiImages = Array.isArray(extracted.images) ? extracted.images : [];
    const allImages = [...new Set([...extractedImages, ...aiImages])].slice(
      0,
      30,
    );

    const result: ExtractedHotel = {
      name: extracted.name || urlNameHint || "",
      description: extracted.description || "",
      property_type: validTypes.includes(extracted.property_type)
        ? extracted.property_type
        : "hotel",
      city: extracted.city || "",
      country: extracted.country || "",
      address: extracted.address || "",
      location: extracted.location || "",
      latitude:
        typeof extracted.latitude === "number" ? extracted.latitude : null,
      longitude:
        typeof extracted.longitude === "number" ? extracted.longitude : null,
      amenities: Array.isArray(extracted.amenities)
        ? deduplicateAmenities(extracted.amenities)
        : [],
      phone: extracted.phone || null,
      images: allImages,
      star_rating:
        typeof extracted.star_rating === "number" ? extracted.star_rating : null,
      check_in_time: extracted.check_in_time || null,
      check_out_time: extracted.check_out_time || null,
      room_types: Array.isArray(extracted.room_types)
        ? extracted.room_types.map((rt: any) => ({
            name: rt.name || "Standard Room",
            description: rt.description || "",
            max_guests: typeof rt.max_guests === "number" && rt.max_guests > 0 ? rt.max_guests : 2,
            base_price: typeof rt.base_price === "number" && rt.base_price > 0 ? rt.base_price : 0,
            amenities: Array.isArray(rt.amenities) ? rt.amenities.slice(0, 20) : [],
            images: Array.isArray(rt.images) ? rt.images.slice(0, 5) : [],
          })).slice(0, 20)
        : [],
    };

    // Airbnb fallback: if room price is 0, try to extract from page content
    if (source === 'airbnb' && result.room_types.length > 0 && result.room_types[0].base_price === 0) {
      const priceMatch = pageContent.match(/[\$€£]\s*(\d[\d,]*)\s*(?:per\s*)?night/i)
        || pageContent.match(/(\d[\d,]*)\s*(?:USD|EUR|GBP|IQD)\s*(?:per\s*)?night/i)
        || pageContent.match(/(\d[\d,]*)\s*\/\s*night/i)
        || pageContent.match(/price.*?(\d[\d,]+)/i)
        || pageContent.match(/(\d[\d,]+)\s*night/i);
      if (priceMatch) {
        const price = parseFloat(priceMatch[1].replace(/,/g, ''));
        if (price > 0 && price < 100000) {
          result.room_types[0].base_price = price;
        }
      }
    }

    // Airbnb fallback: if no amenities from AI, that's a problem - flag it
    if (source === 'airbnb' && result.amenities.length === 0) {
      // Try to extract basic amenities from common Airbnb keywords in content
      const amenityPatterns: [RegExp, string][] = [
        [/wifi|wi-fi|internet/i, "Free WiFi"],
        [/pool/i, "Pool"],
        [/kitchen/i, "Kitchen"],
        [/parking/i, "Free Parking"],
        [/air condition|ac\b|a\/c/i, "Air Conditioning"],
        [/washing machine|washer/i, "Washing Machine"],
        [/tv|television/i, "TV"],
        [/garden/i, "Garden"],
        [/balcony|patio|terrace/i, "Terrace"],
        [/bbq|barbecue|grill/i, "BBQ Facilities"],
        [/hot tub|jacuzzi/i, "Hot Tub"],
        [/gym|fitness/i, "Gym"],
        [/fireplace/i, "Fireplace"],
        [/workspace|dedicated desk/i, "Desk"],
        [/mountain view/i, "Mountain View"],
        [/lake|sea view|ocean view/i, "Sea View"],
        [/pet/i, "Pet Friendly"],
        [/breakfast/i, "Breakfast"],
        [/heating/i, "Heating"],
        [/elevator|lift/i, "Elevator"],
      ];
      const fallbackAmenities: string[] = [];
      for (const [pattern, name] of amenityPatterns) {
        if (pattern.test(pageContent) && !fallbackAmenities.includes(name)) {
          fallbackAmenities.push(name);
        }
      }
      if (fallbackAmenities.length > 0) {
        result.amenities = fallbackAmenities;
      }
    }

    return jsonResponse({ 
      data: result,
      _debug: {
        contentLength: pageContent.length,
        fetchMethod,
        roomHintsFound: roomHints?.length || 0,
        priceHintsFound: priceHints?.length || 0,
        aiRoomTypesRaw: Array.isArray(extracted.room_types) ? extracted.room_types.length : 0,
        roomHintSamples: (roomHints || []).slice(0, 5),
        priceHintSamples: (priceHints || []).slice(0, 5),
      }
    });
  } catch (err) {
    return jsonResponse({ error: (err instanceof Error ? err.message : "Internal server error") || "Internal server error" }, 500);
  }
});
