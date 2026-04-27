export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const apiKey = body.apiKey;
    
    if (!apiKey) {
      return Response.json({ error: 'FINAM API Key is required' }, { status: 400 });
    }

    const sessionRes = await fetch('https://api.finam.ru/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ secret: apiKey })
    });
    
    if (!sessionRes.ok) {
      const errorText = await sessionRes.text();
      console.error('Finam session failed:', errorText);
      return Response.json({ error: 'Failed to authenticate with Finam API' }, { status: 401 });
    }
    
    const { token: jwt } = await sessionRes.json();
    const authHeader = 'Bearer ' + jwt;

    const detailsRes = await fetch('https://api.finam.ru/v1/sessions/details', {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: jwt })
    });

    if (!detailsRes.ok) {
      return Response.json({ error: 'Failed to fetch Finam token details' }, { status: 500 });
    }
    
    const details = await detailsRes.json();
    if (!details.account_ids || details.account_ids.length === 0) {
      return Response.json({ error: 'No Finam accounts found for this token' }, { status: 404 });
    }
    
    const accountId = details.account_ids[0];

    const accountRes = await fetch(`https://api.finam.ru/v1/accounts/${accountId}`, {
      headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
    });

    if (!accountRes.ok) {
      return Response.json({ error: 'Failed to fetch Finam portfolio' }, { status: 500 });
    }

    const accountData = await accountRes.json();
    return Response.json(accountData);
    
  } catch (error) {
    console.error('Error in /api/finam:', error);
    return Response.json({ error: 'Internal server error while fetching Finam data' }, { status: 500 });
  }
}