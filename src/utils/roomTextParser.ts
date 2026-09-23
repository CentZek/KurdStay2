// Dutch/German → English translation maps for hotel room terminology

const nameTranslations: [RegExp, string][] = [
  // Dutch room type names
  [/\bStandaard\b/gi, 'Standard'],
  [/\bTweepersoonskamer\b/gi, 'Double Room'],
  [/\bEenpersoonskamer\b/gi, 'Single Room'],
  [/\bDriepersoonskamer\b/gi, 'Triple Room'],
  [/\bVierpersoonskamer\b/gi, 'Quadruple Room'],
  [/\bFamiliekamer\b/gi, 'Family Room'],
  [/\bSuperior\b/gi, 'Superior'],
  [/\bLuxe\b/gi, 'Deluxe'],
  [/\bmet\b/gi, 'with'],
  [/\bof\b/gi, 'or'],
  [/\bBedden\b/gi, 'Beds'],
  [/\bSlaapkamer\b/gi, 'Bedroom'],
  [/\bSlaapkamers\b/gi, 'Bedrooms'],
  [/\bAppartement\b/gi, 'Apartment'],
  [/\bStudio\b/gi, 'Studio'],
  [/\bPenthouse\b/gi, 'Penthouse'],
  [/\bKoninklijke\b/gi, 'Royal'],
  [/\bPresidentiële\b/gi, 'Presidential'],
  [/\bEconomie\b/gi, 'Economy'],
  [/\bBudget\b/gi, 'Budget'],
  [/\bKlassieke?\b/gi, 'Classic'],
  [/\bModerne?\b/gi, 'Modern'],
  [/\bGezins\b/gi, 'Family'],
  // German room type names
  [/\bEinzelzimmer\b/gi, 'Single Room'],
  [/\bDoppelzimmer\b/gi, 'Double Room'],
  [/\bDreibettzimmer\b/gi, 'Triple Room'],
  [/\bVierbettzimmer\b/gi, 'Quadruple Room'],
  [/\bFamilienzimmer\b/gi, 'Family Room'],
  [/\bZimmer\b/gi, 'Room'],
  [/\bSuperior\b/gi, 'Superior'],
  [/\bmit\b/gi, 'with'],
  [/\boder\b/gi, 'or'],
  [/\bBetten\b/gi, 'Beds'],
  [/\bSchlafzimmer\b/gi, 'Bedroom'],
]

const bedTranslations: [RegExp, string][] = [
  // Dutch beds
  [/\btweepersoonsbed\b/gi, 'double bed'],
  [/\beenpersoonsbedden\b/gi, 'single beds'],
  [/\beenpersoonsbed\b/gi, 'single bed'],
  [/\bextra groot tweepersoonsbed\b/gi, 'extra-large double bed'],
  [/\bgroot tweepersoonsbed\b/gi, 'large double bed'],
  [/\bslaapbanken\b/gi, 'sofa beds'],
  [/\bslaapbank\b/gi, 'sofa bed'],
  [/\bstapelbed\b/gi, 'bunk bed'],
  [/\bstapelbedden\b/gi, 'bunk beds'],
  [/\ben\b/gi, 'and'],
  [/\bSlaapkamer\b/gi, 'Bedroom'],
  [/\bWoonkamer\b/gi, 'Living room'],
  // German beds
  [/\bDoppelbett\b/gi, 'double bed'],
  [/\bEinzelbetten\b/gi, 'single beds'],
  [/\bEinzelbett\b/gi, 'single bed'],
  [/\bKingsize-Bett\b/gi, 'king bed'],
  [/\bSchlafsofa\b/gi, 'sofa bed'],
  [/\bEtagenbett\b/gi, 'bunk bed'],
  [/\bund\b/gi, 'and'],
]

const amenityMap: Record<string, string> = {
  // Dutch amenities
  'wifi': 'Free WiFi',
  'gratis wifi': 'Free WiFi',
  'airconditioning': 'Air Conditioning',
  'flatscreen-tv': 'Flat-screen TV',
  'flatscreen tv': 'Flat-screen TV',
  'bad': 'Bathtub',
  'douche': 'Shower',
  'balkon': 'Balcony',
  'terras': 'Terrace',
  'uitzicht op de tuin': 'Garden View',
  'uitzicht op de bergen': 'Mountain View',
  'uitzicht op zee': 'Sea View',
  'uitzicht op de stad': 'City View',
  'eigen kitchenette': 'Kitchenette',
  'kitchenette': 'Kitchenette',
  'minibar': 'Minibar',
  'kluis': 'Safe',
  'ensuite badkamer': 'Ensuite Bathroom',
  'privébadkamer': 'Private Bathroom',
  'waterkoker': 'Electric Kettle',
  'koffiezetapparaat': 'Coffee Machine',
  'koelkast': 'Refrigerator',
  'bureau': 'Desk',
  'strijkijzer': 'Iron',
  'haardroger': 'Hairdryer',
  'telefoon': 'Telephone',
  'wasruimte': 'Laundry',
  // German amenities
  'kostenloses wlan': 'Free WiFi',
  'klimaanlage': 'Air Conditioning',
  'flachbildfernseher': 'Flat-screen TV',
  'badewanne': 'Bathtub',
  'dusche': 'Shower',
  'terrasse': 'Terrace',
  'stadtblick': 'City View',
  'meerblick': 'Sea View',
  'gartenblick': 'Garden View',
  'kochnische': 'Kitchenette',
  'safe': 'Safe',
  'eigenes bad': 'Private Bathroom',
  'schreibtisch': 'Desk',
  'kühlschrank': 'Refrigerator',
}

function translateText(text: string, translations: [RegExp, string][]): string {
  let result = text
  for (const [pattern, replacement] of translations) {
    result = result.replace(pattern, replacement)
  }
  return result.replace(/\s+/g, ' ').trim()
}

export function parseRoomTextToTypes(text: string) {
  const rooms: { name: string; description: string; max_guests: number; base_price: number; amenities: string[]; images: string[] }[] = []

  // Normalize line endings
  let normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  
  // Sometimes booking.com copy-paste joins lines with spaces instead of newlines
  const lineCount = normalizedText.split('\n').length
  if (lineCount < 10 && normalizedText.length > 500) {
    // Insert newlines before known patterns to restore structure
    normalizedText = normalizedText
      .replace(/(Kies kamers)/gi, '\n$1')
      .replace(/(Choose rooms)/gi, '\n$1')
      .replace(/(Select rooms)/gi, '\n$1')
      .replace(/(Zimmer auswählen)/gi, '\n$1')
      .replace(/(Max\.\s*personen[:\s]*\d+)/gi, '\n$1')
      .replace(/(Max\.\s*persons[:\s]*\d+)/gi, '\n$1')
      .replace(/(US\$\d+)/g, '\n$1')
      .replace(/(€\d+)/g, '\n$1')
      .replace(/(\d+\s*m²)/g, '\n$1')
      .replace(/(Prijs\s)/gi, '\n$1')
      .replace(/(Inclusief\s)/gi, '\n$1')
      .replace(/(Annuleringskosten)/gi, '\n$1')
      .replace(/(Geen vooruitbetaling)/gi, '\n$1')
      .replace(/(We hebben er\s)/gi, '\n$1')
      .replace(/(korting mogelijk)/gi, '\n$1')
      .replace(/(Standaard\s)/gi, '\n$1')
      .replace(/(Luxe\s)/gi, '\n$1')
      .replace(/(Basic\s)/gi, '\n$1')
      .replace(/(Superior\s)/gi, '\n$1')
      .replace(/(Suite\s)/gi, '\n$1')
      .replace(/(Deluxe\s)/gi, '\n$1')
      .replace(/(Premium\s)/gi, '\n$1')
      .replace(/(Executive\s)/gi, '\n$1')
      .replace(/(Privésuite)/gi, '\n$1')
      .replace(/(Kamer\b)/g, '\n$1')
      .replace(/(Uitzicht\s)/gi, '\n$1')
      .replace(/(Ensuite\s)/gi, '\n$1')
      .replace(/(Flatscreen)/gi, '\n$1')
      .replace(/(Gratis WiFi)/gi, '\n$1')
      .replace(/(Airconditioning)/gi, '\n$1')
      .replace(/(Eigen\s)/gi, '\n$1')
      .replace(/(Balkon)/gi, '\n$1')
  }

  // Primary strategy: split by "Kies kamers" / "Choose rooms" / "Select rooms" / "Zimmer auswählen"
  // Only eat the quantity selector portion (e.g. "0 1 (US$60) 2 (US$120)"), not the entire rest of the line
  const withSplitMarkers = normalizedText.replace(/(?:Kies kamers|Choose rooms|Select rooms|Zimmer auswählen)(?:\s*\d+\s*(?:\([^)]*\))?)*\s*/gi, '\n---ROOM_SPLIT---\n')
  let blocks = withSplitMarkers.split('---ROOM_SPLIT---')

  // If primary split yields only 1-2 blocks (0-1 rooms), use fallback: split by room name patterns
  const allLines = normalizedText.split('\n').map(l => l.trim()).filter(Boolean)
  if (blocks.filter(b => b.trim().length > 20).length <= 2) {
    blocks = []
    let currentBlock: string[] = []
    
    for (const line of allLines) {
      // Detect room name lines: they typically contain room type keywords
      const isRoomName = /^(Standaard|Luxe|Basic|Superior|Deluxe|Budget|Klassieke?|Moderne?|Premium|Executive|Koninklijke|Presidenti|Standard|Double|Single|Twin|Triple|Family|Suite|Apartment|Studio|Penthouse|Einzelzimmer|Doppelzimmer|Dreibettzimmer|Vierbettzimmer|Familienzimmer)/i.test(line) &&
        !line.match(/^(Standaard|Standard)\s*$/i) && // Don't match just the word alone
        line.length >= 10 &&
        line.length <= 100 &&
        !line.match(/^\d/) && // Doesn't start with a number
        !line.match(/m²|US\$|€|\$\d|personen|persons|guests|prijs|price|inclusief|annulering|betaal|belasting/i)
      
      if (isRoomName && currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'))
        currentBlock = [line]
      } else {
        currentBlock.push(line)
      }
    }
    if (currentBlock.length > 0) {
      blocks.push(currentBlock.join('\n'))
    }
  }

  // Also try: if we still have few blocks, look for lines containing room keywords followed by "kamer" / "Room" / "Suite"
  if (blocks.filter(b => b.trim().length > 20).length <= 1) {
    blocks = []
    let currentBlock: string[] = []
    
    for (const line of allLines) {
      const isRoomName = (
        /(?:kamer|room|suite|appartement|apartment|studio|penthouse|zimmer)/i.test(line) &&
        line.length >= 10 && line.length <= 100 &&
        !line.match(/^\d/) &&
        !line.match(/m²|US\$|€|\$\d|personen|persons|guests|prijs|price|inclusief|annulering|betaal|belasting|kies|choose|select/i) &&
        !line.match(/^(Kamer|Room)$/i) // Skip bare "Kamer" / "Room" line
      )
      
      if (isRoomName && currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'))
        currentBlock = [line]
      } else {
        currentBlock.push(line)
      }
    }
    if (currentBlock.length > 0) {
      blocks.push(currentBlock.join('\n'))
    }
  }

  for (const block of blocks) {
    const trimmed = block.trim()
    if (!trimmed || trimmed.length < 20) continue

    const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length < 3) continue

    // Skip header/junk lines to find the room name
    let nameIdx = 0
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].toLowerCase()
      if (
        l.includes('kamertype') || l.includes('room type') || l.includes('selecteer een') ||
        l.includes('aantal gasten') || l.includes('prijs van') || l.includes('je opties') ||
        l.includes('your choices') || l.includes('number of guests') || l.includes('price for') ||
        l.includes('zimmertyp') || l.includes('anzahl') || l.includes('inclusief belasting') ||
        l.includes('annuleringskosten') || l.includes('geen vooruitbetaling') ||
        l.includes('betaal bij') || l.includes('korting mogelijk') ||
        l.includes('we hebben er') || l === '•' || l.match(/^0\s+1\s+/)
      ) continue
      nameIdx = i
      break
    }
    const rawName = lines[nameIdx] || ''
    if (!rawName || rawName.length < 3 || rawName.length > 100) continue
    // Skip if the "name" looks like a price, size, or junk line
    if (rawName.match(/^(US\$|€|\$)\d|^\d+\s*m²|^Max\.|^Prijs|^Inclusief|^Annulering|^Geen\s/i)) continue

    const fullText = lines.join(' ')

    // Extract price
    const priceMatch = fullText.match(/(?:US\$|€|\$)\s*(\d+(?:[.,]\d+)?)/i)
    const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : 0

    // Extract max guests
    const guestsMatch = fullText.match(/Max\.?\s*(?:personen|persons|guests|Personen)[:\s]*(\d+)/i)
    const maxGuests = guestsMatch ? parseInt(guestsMatch[1]) : 2

    // Extract room size
    const sizeMatch = fullText.match(/(\d+)\s*m²/i)
    const size = sizeMatch ? `${sizeMatch[1]} m²` : ''

    // Extract bed description
    let bedDesc = ''
    for (let i = nameIdx + 1; i < Math.min(nameIdx + 5, lines.length); i++) {
      const l = lines[i]
      if (l.match(/kies je bed|indien beschikbaar|Bett wählen/i)) continue
      if (l.match(/bed|sofa|slaap|Bett|Schlaf/i) && !l.match(/^\d+ m²|uitzicht|bad$|airco|wifi|tv|Blick/i)) {
        bedDesc += (bedDesc ? ', ' : '') + l
      }
    }

    // Extract amenities from full text
    const amenities: string[] = []
    const fullLower = fullText.toLowerCase()
    for (const [keyword, english] of Object.entries(amenityMap)) {
      if (fullLower.includes(keyword)) {
        if (!amenities.includes(english)) {
          amenities.push(english)
        }
      }
    }

    // Translate name and bed description to English
    const name = translateText(rawName, nameTranslations)
    const translatedBedDesc = translateText(bedDesc, bedTranslations)
    const description = [translatedBedDesc, size].filter(Boolean).join(' | ')

    rooms.push({
      name,
      description,
      max_guests: maxGuests,
      base_price: price,
      amenities: [...new Set(amenities)],
      images: [],
    })
  }

  return rooms
}
