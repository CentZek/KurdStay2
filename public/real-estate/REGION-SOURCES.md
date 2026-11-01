# Regional inventory and source checks

Checked 1 November 2026. This is a snapshot of real source advertisements, not independently verified properties. No fictional records or example property photos are included.

| Region | Priced ads with source photos | Confirmed video embeds |
|---|---:|---:|
| Duhok | 36 | 0 |
| Erbil | 3483 | 1 |
| Sulaymaniyah | 642 | 3 |
| Halabja | 2 | 0 |

Scanned 10,659 distinct advertisements from Paya Real Estate's paginated public sale catalog across Duhok, Erbil, Sulaymaniyah and Halabja. Included 4,163; 4,079 are additions and 9 previous entries were removed under the stricter eligibility rules. These are advertisement counts, not a guarantee of distinct physical properties.

Source search pages: https://paya-realestate.com/en/search/properties/for-sale/{City}/All?page={page}. Cities use the English spellings in the table. Full source identity, individual original-ad URLs, dates, price evidence, source coordinates and details are retained in dist/listings.json. The import audit is dist/assets/inventory-audit.json.

Eligibility requires an active for-sale advertisement, a house, apartment or residential land type, positive advertised area, an explicit TOTAL price in USD, and at least one usable source property photograph. Deposit/first-installment/upfront and per-square-metre quotes, unsupported currencies, unrelated property categories and absent photos are excluded. Repeated references and matching photo/specification fingerprints are deduplicated; identical physical properties may still be advertised by different agents.

Halabja's catalog returned only three source ads. Only 2 meet the photo and price requirements. Broader English, Kurdish and Arabic searches did not substantiate enough additional eligible inventory. The user expressly requested real sourced listings only.

Photos belong to the source advertisement and are credited to the advertiser via Paya. Every included ad has an image URL whose response was checked for successful image status and JPEG/PNG/WebP bytes, or an already downloaded source image with valid bytes. Checked gallery images are used where available; existing downloaded galleries are retained. There are 5,616 photo entries. Most new images load lazily from the source CDN; they can become unavailable if the source removes them. No generic stock-photo substitutes are used for listings. A photo does not establish ownership or an accurate boundary.

Previously checked property videos are retained when their listing remains eligible. Video URLs came from their corresponding individual property pages. Four YouTube embeds previously returned matching oEmbed metadata; other links remain external-only where playback could not be confirmed. New ads are not assigned unrelated videos. Actual playback is subject to the source host. Details: dist/assets/listing-video-sources.json.

Prices are the catalog's explicit total asking prices, not valuations. Availability, title, specifications, photographs and exact location are unverified. Check the original advertisement and contact the advertiser before relying on them. The catalog scan does not check every individual detail page or establish current availability.

Maps use OpenStreetMap and Leaflet. Area choices use advertised area names and approximate navigation points, not official boundary polygons. All imported pins remain source-reported and unverified, without invented offsets. Missing/out-of-region source coordinates remain unmapped. Verified latitude/longitude and cadastral parcel geometry remain null.

Results render 12 cards per page on phones and 24 on wider screens, while the map continues to represent all matching mappable advertisements. Map groups display 40 items per dialog page. This bounds DOM and image loading as the inventory grows.
