import { requestClient } from "../_shared/session.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, X-Stay-Session, X-Stay-Visitor",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  intent?: string;
  siteUrl?: string;
  language?: string;
}

const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  en: "Respond in English.",
  ckb: "Respond in Kurdish (Sorani), written in Arabic script.",
  kmr: "Respond in Kurdish (Bahdini dialect), written in Arabic script.",
  ar: "Respond in Arabic.",
};

async function queryHotelsAndAvailability(siteUrl: string) {
  const { data: hotels } = await supabase
    .from("hotels")
    .select(
      "id, name, city, location, country, property_type, amenities, currency, room_types(id, name, base_price, max_guests, amenities)",
    )
    .eq("status", "active")
    .limit(20);

  if (!hotels || hotels.length === 0) return "No hotels are currently listed.";

  let result = "Available properties:\n\n";
  for (const hotel of hotels) {
    const link = `${siteUrl}/hotel/${hotel.id}`;
    result += `- **${hotel.name}** (${hotel.property_type}) in ${hotel.city}, ${hotel.country}\n`;
    result += `  Location: ${hotel.location}\n`;
    result += `  Page: ${link}\n`;
    if (hotel.amenities?.length)
      result += `  Amenities: ${hotel.amenities.join(", ")}\n`;
    if (hotel.room_types?.length) {
      result += `  Rooms:\n`;
      for (const room of hotel.room_types) {
        result += `    - ${room.name}: ${hotel.currency || "USD"} ${room.base_price}/night (up to ${room.max_guests} guests)\n`;
      }
    }
    result += "\n";
  }
  return result;
}

function extractDigits(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

async function queryBookingByPhone(phone: string, scoped: ReturnType<typeof requestClient>) {
  const digits = extractDigits(phone);
  // Use last 9-10 digits for flexible matching (handles +964, 00964, 0 prefix variations)
  const matchDigits = digits.length >= 10 ? digits.slice(-10) : digits.slice(-9);

  const { data: bookings } = await scoped
    .from("bookings")
    .select(
      "id, check_in_date, check_out_date, guests, rooms, final_price_total, status, notes, customer_name, customer_phone, hotels(name, city), room_types(name)",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (!bookings || bookings.length === 0) {
    return `No bookings found for phone number: ${phone}. Please double-check the mobile number used during booking.`;
  }

  // Filter by matching last digits of phone number
  const matched = bookings.filter((b) => {
    if (!b.customer_phone) return false;
    const bDigits = extractDigits(b.customer_phone);
    const bMatch = bDigits.length >= 10 ? bDigits.slice(-10) : bDigits.slice(-9);
    return bMatch === matchDigits;
  });

  if (matched.length === 0) {
    return `No bookings found for phone number: ${phone}. Please double-check the mobile number used during booking.`;
  }

  let result = `Found ${matched.length} booking(s) for ${phone}:\n\n`;
  for (const b of matched) {
    const hotel = (b as any).hotels;
    const room = (b as any).room_types;
    result += `- Booking #${b.id.substring(0, 8)}\n`;
    result += `  Name: ${b.customer_name}\n`;
    result += `  Hotel: ${hotel?.name || "Unknown"} (${hotel?.city || ""})\n`;
    result += `  Room: ${room?.name || "Unknown"}\n`;
    result += `  Check-in: ${b.check_in_date} | Check-out: ${b.check_out_date}\n`;
    result += `  Guests: ${b.guests} | Rooms: ${b.rooms}\n`;
    result += `  Total: ${b.final_price_total}\n`;
    result += `  Status: ${b.status}\n`;
    if (b.notes) result += `  Notes: ${b.notes}\n`;
    result += "\n";
  }
  return result;
}

async function queryHotelDetails() {
  const { data: hotels } = await supabase
    .from("hotels")
    .select(
      "id, name, city, location, amenities, property_type, phone, contact_person",
    )
    .eq("status", "active");

  if (!hotels || hotels.length === 0) return "No properties currently listed.";

  let result = "Our listed properties:\n\n";
  for (const h of hotels) {
    result += `- **${h.name}** (${h.property_type}) — ${h.city}, ${h.location}\n`;
    if (h.amenities?.length) result += `  Amenities: ${h.amenities.join(", ")}\n`;
    if (h.phone) result += `  Phone: ${h.phone}\n`;
    if (h.contact_person) result += `  Contact: ${h.contact_person}\n`;
    result += "\n";
  }
  return result;
}

async function submitSupportRequest(
  email: string | null,
  whatsapp: string | null,
  question: string,
) {
  const { error } = await supabase.from("support_requests").insert({
    email,
    whatsapp,
    question,
    category: "other",
  });
  if (error) return false;
  return true;
}

async function callAI(
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "moonshotai/kimi-k2",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      temperature: 0.4,
      max_tokens: 1500,
    }),
  });

  if (!res.ok) {
    throw new Error(`AI service error: ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "I'm sorry, I couldn't process that. Please try again.";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body: ChatRequest = await req.json();
    const { messages, intent, siteUrl, language } = body;

    if (!messages || messages.length === 0) {
      return jsonResponse({ error: "No messages provided" }, 400);
    }

    const baseUrl = siteUrl || "";
    const lastUserMessage =
      messages[messages.length - 1]?.content?.toLowerCase() || "";

    // Handle "submit_support" action
    if (intent === "submit_support") {
      try {
        const parsed = JSON.parse(messages[messages.length - 1].content);
        const success = await submitSupportRequest(
          parsed.email || null,
          parsed.whatsapp || null,
          parsed.question,
        );
        if (success) {
          return jsonResponse({
            reply:
              "Thank you! Your question has been submitted successfully. One of our agents will get back to you as soon as possible via your provided contact method.",
          });
        }
        return jsonResponse({
          reply:
            "I'm sorry, there was a problem submitting your request. Please make sure you provided at least one contact method (email or WhatsApp number).",
        });
      } catch {
        return jsonResponse({
          reply: "There was an error processing your request. Please try again.",
        });
      }
    }

    // Handle different intents
    let contextData = "";
    let systemPrompt = "";

    switch (intent) {
      case "reservation": {
        // Look for a phone number in the conversation (digits, possibly with + or spaces/dashes)
        const phoneRegex = /(?:\+?\d[\d\s\-()]{6,}\d)/;
        let foundPhone = "";
        for (const msg of messages) {
          const match = msg.content.match(phoneRegex);
          if (match) {
            foundPhone = match[0];
          }
        }

        if (foundPhone) {
          contextData = await queryBookingByPhone(foundPhone, requestClient(req));
        }

        systemPrompt = `You are a helpful hotel booking assistant for KurdStay. The customer wants help with a current reservation or cancellation.

STRICT RULE: You ONLY help with KurdStay hotel-related topics (reservations, cancellations, bookings). If the user asks ANYTHING unrelated to hotels, travel, bookings, or accommodation, politely decline and say "I can only help with KurdStay booking-related questions. Is there anything else about your reservation I can assist with?"

${contextData ? `Here is the booking data from our system:\n${contextData}\n` : ""}

Your job:
- If no phone/mobile number has been provided yet, ask for the mobile number they used when booking.
- Once you have booking data, help them understand their reservation details.
- For cancellations, explain that you can note their cancellation request and an agent will process it. Ask them to confirm the booking they want to cancel.
- Be concise, friendly, and helpful.
- If a booking shows status "cancelled", let them know it's already cancelled.
- If no bookings found, suggest they check the mobile number or try a different one. They may have used a different number when booking.
- NEVER invent booking details. Only reference data shown above.`;
        break;
      }

      case "feedback": {
        contextData = await queryHotelDetails();
        systemPrompt = `You are a helpful hotel booking assistant for KurdStay. The customer wants to provide service feedback.

STRICT RULE: You ONLY help with KurdStay hotel-related topics. If the user asks ANYTHING unrelated to hotels, travel, bookings, or accommodation (like programming, math, general knowledge, etc.), politely decline and say "I can only assist with KurdStay-related matters. Would you like to share feedback about one of our properties?"

Here are our listed properties:\n${contextData}

Your job:
- Ask which property their feedback is about (list the names if helpful).
- Ask them to share their experience - what was good and what could be improved.
- Thank them for their feedback and let them know it helps us improve.
- Be empathetic and professional.
- If they had a bad experience, acknowledge it and let them know you'll pass it to the team.`;
        break;
      }

      case "availability": {
        contextData = await queryHotelsAndAvailability(baseUrl);
        systemPrompt = `You are a helpful hotel booking assistant for KurdStay. The customer is looking for available properties and listings.

STRICT RULE: You ONLY help with KurdStay hotel-related topics. If the user asks ANYTHING unrelated to hotels, travel, bookings, or accommodation, politely decline and redirect them back to how you can help with finding a stay.

Here is our current availability data:\n${contextData}

Your job:
- Help the customer find suitable accommodation based on their needs (location, budget, guests, dates).
- Present options clearly with prices and amenities.
- ALWAYS include the direct link to the hotel page so they can view details and book. Format links like: ${baseUrl}/hotel/[id]
- If they ask about specific dates, explain that prices shown are base rates and availability may vary.
- Suggest they click the link to the hotel page for the most up-to-date availability and to make a booking.
- Be helpful and informative. Do NOT make up properties or prices not in the data above.
- If the user's needs match specific properties, recommend those specifically with their links.`;
        break;
      }

      case "list_property": {
        systemPrompt = `You are a helpful hotel booking assistant for KurdStay. The customer wants to list their property on our platform.

STRICT RULE: You ONLY help with KurdStay hotel-related topics. If the user asks ANYTHING unrelated to hotels, travel, property listing, or accommodation, politely decline and say "I can only assist with KurdStay-related matters. Would you like to continue listing your property?"

Your job:
- Explain that we'd be happy to list their property on KurdStay.
- Ask for these details about their property:
  1. Property name
  2. Property type (hotel, motel, apartment, villa, farm)
  3. Location/city
  4. Number of rooms
  5. Contact person name
  6. Contact phone or email
- Once they provide the details, let them know our team will review and get back to them within 24-48 hours.
- Be professional and welcoming.`;
        break;
      }

      case "other": {
        // AI tries to classify or asks for contact info
        systemPrompt = `You are a helpful hotel booking assistant for KurdStay. The customer selected "Other questions."

STRICT RULE: You ONLY help with KurdStay hotel-related topics (bookings, reservations, hotels, travel, accommodation, property listings, feedback). If the user asks ANYTHING unrelated (programming, math, science, recipes, general knowledge, writing help, etc.), you MUST refuse and say: "I'm sorry, I can only help with KurdStay hotel and booking-related questions. If you have a question about reservations, availability, feedback, or listing a property, I'm happy to assist!"

Do NOT answer off-topic questions under any circumstances, even if the user insists. You are NOT a general-purpose AI assistant.

Your job:
1. First, ask what their question is about.
2. After they state their question, determine if it fits one of these categories:
   - Reservation/cancellation help
   - Service feedback
   - Finding availability/listings
   - Listing their property
3. If it fits one of those, help them directly using your knowledge.
4. If it is hotel/travel-related but does NOT fit any category above, politely explain that you'll need to connect them with a human agent. Ask them to provide:
   - Their email address OR WhatsApp number (or both)
   - Their full question
   Tell them one of our agents will get back to them ASAP.
5. When they provide contact info + question, respond with EXACTLY this JSON format (and nothing else):
   {"action":"submit_support","email":"their@email.com","whatsapp":"+123456","question":"their question"}
   Only include email/whatsapp if they provided it. This will be processed automatically.

Be friendly and helpful — but ONLY about hotel/booking topics.`;
        break;
      }

      default: {
        systemPrompt = `You are a helpful hotel booking assistant for KurdStay, a hotel booking platform.

STRICT RULE: You ONLY help with KurdStay hotel-related topics. If the user asks ANYTHING unrelated to hotels, travel, bookings, or accommodation, politely decline and redirect them to the menu options.

Greet the customer briefly and present these options:

1. Current reservation or cancellation
2. Service feedback
3. Find availability and listings
4. List your stay/property
5. Other questions

Ask which they'd like help with. Be brief and friendly.`;
        break;
      }
    }

    const langInstruction =
      LANGUAGE_INSTRUCTIONS[language || "en"] || LANGUAGE_INSTRUCTIONS.en;
    systemPrompt += `\n\nLANGUAGE: ${langInstruction}`;

    const reply = await callAI(systemPrompt, messages);

    // Check if the AI response contains a support submission JSON
    const supportMatch = reply.match(
      /\{"action"\s*:\s*"submit_support"[^}]*\}/,
    );
    if (supportMatch) {
      try {
        const parsed = JSON.parse(supportMatch[0]);
        const success = await submitSupportRequest(
          parsed.email || null,
          parsed.whatsapp || null,
          parsed.question,
        );
        if (success) {
          return jsonResponse({
            reply:
              "Thank you! Your question has been submitted successfully. One of our agents will get back to you as soon as possible via your provided contact method.",
          });
        }
      } catch {
        // Fall through to return the AI reply as-is
      }
    }

    return jsonResponse({ reply });
  } catch (err) {
    return jsonResponse(
      { error: (err instanceof Error ? err.message : "Internal server error") || "Internal server error" },
      500,
    );
  }
});
