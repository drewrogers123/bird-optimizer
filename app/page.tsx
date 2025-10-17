'use client';

import React, { useState, useEffect } from 'react';
import { MapPin, Bird, TrendingUp, AlertCircle } from 'lucide-react';

// eBird API configuration
const EBIRD_API_BASE = 'https://api.ebird.org/v2';

const LifeListOptimizer = () => {
  const [apiKey, setApiKey] = useState(process.env.NEXT_PUBLIC_EBIRD_API_KEY || '');
  const [stage, setStage] = useState('config');
  const [hotspots, setHotspots] = useState<any[]>([]);
  const [speciesData, setSpeciesData] = useState<Record<string, any>>({});
  const [userLifeList, setUserLifeList] = useState<Set<string>>(new Set());
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Chicago West Side approximate bounds
  const CHICAGO_WEST = {
    name: "Chicago West Side",
    lat: 41.94,
    lng: -87.67,
    radius: 20 // km
  };

  // Step 1: Fetch hotspots in the region
  const fetchHotspots = async () => {
    if (!apiKey) {
      setError('Please enter your eBird API key');
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      // Use geo endpoint to get hotspots within radius
      const response = await fetch(
        `${EBIRD_API_BASE}/ref/hotspot/geo?lat=${CHICAGO_WEST.lat}&lng=${CHICAGO_WEST.lng}&dist=${CHICAGO_WEST.radius}&fmt=json`,
        {
          headers: { 'X-eBirdApiToken': apiKey }
        }
      );
      
      if (!response.ok) throw new Error('Failed to fetch hotspots. Please check your API key.');
      
      const hotspots = await response.json();
      
      // Add distance calculation for display purposes
      const hotspotsWithDistance = hotspots.map((h: any) => ({
        ...h,
        distance: calculateDistance(CHICAGO_WEST.lat, CHICAGO_WEST.lng, h.lat, h.lng)
      })).sort((a: any, b: any) => a.distance - b.distance);
      
      setHotspots(hotspotsWithDistance);
      setStage('hotspots');
      return hotspotsWithDistance;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Fetch recent observations for each hotspot
  const fetchHotspotSpecies = async (hotspotId: string) => {
    try {
      const response = await fetch(
        `${EBIRD_API_BASE}/data/obs/${hotspotId}/recent?back=30`,
        {
          headers: { 'X-eBirdApiToken': apiKey }
        }
      );
      
      if (!response.ok) throw new Error(`Failed to fetch species for ${hotspotId}`);
      
      const observations = await response.json();
      
      // Calculate species frequency
      const speciesFrequency: any = {};
      observations.forEach((obs: any) => {
        if (!speciesFrequency[obs.speciesCode]) {
          speciesFrequency[obs.speciesCode] = {
            commonName: obs.comName,
            scientificName: obs.sciName,
            count: 0,
            lastSeen: obs.obsDt
          };
        }
        speciesFrequency[obs.speciesCode].count++;
      });
      
      return {
        hotspotId,
        species: speciesFrequency,
        totalChecklists: observations.length
      };
    } catch (err) {
      console.error(`Error fetching species for ${hotspotId}:`, err);
      return { hotspotId, species: {}, totalChecklists: 0 };
    }
  };

  // Step 3: Process all hotspots
  const processAllHotspots = async () => {
    setLoading(true);
    setError(null);
    try {
      const results: any = {};
      
      // Process hotspots in batches to avoid rate limits
      for (const hotspot of hotspots as any[]) {
        const data = await fetchHotspotSpecies(hotspot.locId);
        results[hotspot.locId] = data;
        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      setSpeciesData(results);
      setStage('species');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Calculate recommendations based on life list
  const calculateRecommendations = () => {
    const recs = (hotspots as any[]).map(hotspot => {
      const hotspotData = (speciesData as any)[hotspot.locId];
      if (!hotspotData) return null;

      // Count species not on life list
      const newSpecies = Object.entries(hotspotData.species).filter(
        ([code, _]) => !userLifeList.has(code)
      );

      // Calculate probability-weighted expected value
      const expectedNewSpecies = newSpecies.reduce((sum, [_, data]: [string, any]) => {
        const probability = data.count / hotspotData.totalChecklists;
        return sum + probability;
      }, 0);

      // Calculate distance from center point
      const distance = calculateDistance(
        CHICAGO_WEST.lat, CHICAGO_WEST.lng,
        hotspot.lat, hotspot.lng
      );

      // Simple score: expected new species / distance
      const score = distance > 0 ? expectedNewSpecies / Math.sqrt(distance) : expectedNewSpecies;

      return {
        hotspot,
        newSpeciesCount: newSpecies.length,
        expectedNewSpecies: expectedNewSpecies.toFixed(1),
        distance: distance.toFixed(1),
        score: score.toFixed(2),
        topNewSpecies: newSpecies
          .sort((a, b) => (b[1] as any).count - (a[1] as any).count)
          .slice(0, 5)
          .map(([_, data]: [string, any]) => ({
            name: data.commonName,
            probability: ((data.count / hotspotData.totalChecklists) * 100).toFixed(0)
          }))
      };
    }).filter(r => r !== null);

    recs.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
    setRecommendations(recs);
    setStage('recommendations');
  };

  // Helper: Calculate distance between two lat/lng points (Haversine)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const toRad = (deg: number) => deg * (Math.PI/180);

  // Toggle bird in life list
  const toggleBirdInLifeList = (code: string) => {
    const newList = new Set(userLifeList);
    if (newList.has(code)) {
      newList.delete(code);
    } else {
      newList.add(code);
    }
    setUserLifeList(newList);
  };

  // Top 100 most common birds in Chicago area
  const COMMON_CHICAGO_BIRDS = [
    { code: 'amerob', name: 'American Robin' },
    { code: 'norcad', name: 'Northern Cardinal' },
    { code: 'bkcchi', name: 'Black-capped Chickadee' },
    { code: 'amecro', name: 'American Crow' },
    { code: 'blujay', name: 'Blue Jay' },
    { code: 'mourdo', name: 'Mourning Dove' },
    { code: 'amegfi', name: 'American Goldfinch' },
    { code: 'rebwoo', name: 'Red-bellied Woodpecker' },
    { code: 'dowwoo', name: 'Downy Woodpecker' },
    { code: 'eucspa', name: 'European Starling' },
    { code: 'houspa', name: 'House Sparrow' },
    { code: 'houfin', name: 'House Finch' },
    { code: 'carwre', name: 'Carolina Wren' },
    { code: 'norfli', name: 'Northern Flicker' },
    { code: 'whbnut', name: 'White-breasted Nuthatch' },
    { code: 'haiwoo', name: 'Hairy Woodpecker' },
    { code: 'rocpig', name: 'Rock Pigeon' },
    { code: 'redhea', name: 'Red-headed Woodpecker' },
    { code: 'cedwax', name: 'Cedar Waxwing' },
    { code: 'grbher3', name: 'Great Blue Heron' },
    { code: 'mallard', name: 'Mallard' },
    { code: 'rethaw', name: 'Red-tailed Hawk' },
    { code: 'compoo', name: 'Common Poorwill' },
    { code: 'killde', name: 'Killdeer' },
    { code: 'turvul', name: 'Turkey Vulture' },
    { code: 'grajay', name: 'Gray Jay' },
    { code: 'rewbla', name: 'Red-winged Blackbird' },
    { code: 'comgra', name: 'Common Grackle' },
    { code: 'brnowl', name: 'Barred Owl' },
    { code: 'amekes', name: 'American Kestrel' },
    { code: 'kinrai', name: 'King Rail' },
    { code: 'rebnut', name: 'Red-breasted Nuthatch' },
    { code: 'woothr', name: 'Wood Thrush' },
    { code: 'easblu', name: 'Eastern Bluebird' },
    { code: 'banswa', name: 'Bank Swallow' },
    { code: 'chispa', name: 'Chipping Sparrow' },
    { code: 'sonspa', name: 'Song Sparrow' },
    { code: 'daejun', name: 'Dark-eyed Junco' },
    { code: 'wbwwre1', name: 'White-breasted Wood-Wren' },
    { code: 'bawwar', name: 'Bay-breasted Warbler' },
    { code: 'yelwar', name: 'Yellow Warbler' },
    { code: 'comyel', name: 'Common Yellowthroat' },
    { code: 'carchi', name: 'Carolina Chickadee' },
    { code: 'tuftit', name: 'Tufted Titmouse' },
    { code: 'brncre', name: 'Brown Creeper' },
    { code: 'whttre', name: 'White-throated Sparrow' },
    { code: 'foxspa', name: 'Fox Sparrow' },
    { code: 'swaspa', name: 'Swamp Sparrow' },
    { code: 'easmea', name: 'Eastern Meadowlark' },
    { code: 'brohea', name: 'Brown-headed Cowbird' },
    { code: 'orcori', name: 'Orchard Oriole' },
    { code: 'balori', name: 'Baltimore Oriole' },
    { code: 'scatan', name: 'Scarlet Tanager' },
    { code: 'norcar', name: 'Northern Parula' },
    { code: 'canvas', name: 'Canvasback' },
    { code: 'rinduc', name: 'Ring-necked Duck' },
    { code: 'lesyel', name: 'Lesser Yellowlegs' },
    { code: 'solsan', name: 'Solitary Sandpiper' },
    { code: 'sposan', name: 'Spotted Sandpiper' },
    { code: 'ribgul', name: 'Ring-billed Gull' },
    { code: 'hergul', name: 'Herring Gull' },
    { code: 'cacgoo1', name: 'Canada Goose' },
    { code: 'gnwtea', name: 'Green-winged Teal' },
    { code: 'buwtea', name: 'Blue-winged Teal' },
    { code: 'norsho', name: 'Northern Shoveler' },
    { code: 'gadwal', name: 'Gadwall' },
    { code: 'amewig', name: 'American Wigeon' },
    { code: 'lessca', name: 'Lesser Scaup' },
    { code: 'buffle', name: 'Bufflehead' },
    { code: 'comgol', name: 'Common Goldeneye' },
    { code: 'hoomer', name: 'Hooded Merganser' },
    { code: 'commer', name: 'Common Merganser' },
    { code: 'piebie1', name: 'Pied-billed Grebe' },
    { code: 'doccor', name: 'Double-crested Cormorant' },
    { code: 'grnher', name: 'Green Heron' },
    { code: 'bcnher', name: 'Black-crowned Night-Heron' },
    { code: 'coohaw', name: "Cooper's Hawk" },
    { code: 'shshaw', name: 'Sharp-shinned Hawk' },
    { code: 'baleag', name: 'Bald Eagle' },
    { code: 'osprey', name: 'Osprey' },
    { code: 'merlin', name: 'Merlin' },
    { code: 'pefal', name: 'Peregrine Falcon' },
    { code: 'amecoo', name: 'American Coot' },
    { code: 'sancra', name: 'Sandhill Crane' },
    { code: 'chimni', name: 'Chimney Swift' },
    { code: 'rethum', name: 'Ruby-throated Hummingbird' },
    { code: 'belkin1', name: 'Belted Kingfisher' },
    { code: 'yebsap', name: 'Yellow-bellied Sapsucker' },
    { code: 'pilwoo', name: 'Pileated Woodpecker' },
    { code: 'easpho', name: 'Eastern Phoebe' },
    { code: 'grcfly', name: 'Great Crested Flycatcher' },
    { code: 'easkin', name: 'Eastern Kingbird' },
    { code: 'whevir', name: 'White-eyed Vireo' },
    { code: 'belvir', name: 'Bell\'s Vireo' },
    { code: 'yetgvi', name: 'Yellow-throated Vireo' },
    { code: 'warvir', name: 'Warbling Vireo' },
    { code: 'reevir1', name: 'Red-eyed Vireo' }
  ];

  return (
    <div className="max-w-6xl mx-auto p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
        <h1 className="text-3xl font-bold mb-2 text-gray-800">
          eBird Life List Optimizer
        </h1>
        <p className="text-gray-600 mb-4">
          Pipeline Demo: Chicago West Side
        </p>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Configuration Stage */}
        {stage === 'config' && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 p-4 rounded">
              <h3 className="font-semibold mb-2">Setup Instructions:</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Get an eBird API key from <a href="https://ebird.org/api/keygen" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">ebird.org/api/keygen</a></li>
                <li>Enter your API key below</li>
                <li>Click &quot;Fetch Hotspots&quot; to begin</li>
              </ol>
            </div>

            <div className="space-y-2">
              <label className="block">
                <span className="font-semibold">eBird API Key:</span>
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your eBird API key"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </label>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold">Region: {CHICAGO_WEST.name}</h3>
              <p className="text-sm text-gray-600">
                Center: {CHICAGO_WEST.lat}°N, {CHICAGO_WEST.lng}°W
              </p>
              <p className="text-sm text-gray-600">
                Radius: {CHICAGO_WEST.radius}km
              </p>
            </div>

            <button
              onClick={fetchHotspots}
              disabled={loading || !apiKey}
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 flex items-center gap-2"
            >
              <MapPin size={20} />
              {loading ? 'Fetching...' : 'Step 1: Fetch Hotspots'}
            </button>
          </div>
        )}

        {/* Hotspots Stage */}
        {stage === 'hotspots' && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 p-4 rounded">
              <p className="font-semibold">✓ Found {hotspots.length} hotspots in region</p>
            </div>

            <div className="max-h-64 overflow-y-auto border rounded p-4">
              {(hotspots as any[]).map(h => (
                <div key={h.locId} className="text-sm py-1 border-b last:border-b-0">
                  <span className="font-medium">{h.locName}</span>
                  <span className="text-gray-500 ml-2">
                    ({calculateDistance(CHICAGO_WEST.lat, CHICAGO_WEST.lng, h.lat, h.lng).toFixed(1)}km away)
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={processAllHotspots}
              disabled={loading}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center gap-2"
            >
              <Bird size={20} />
              {loading ? 'Processing...' : 'Step 2: Fetch Species Data'}
            </button>
          </div>
        )}

        {/* Species Selection Stage */}
        {stage === 'species' && (
          <div className="space-y-6">
            <div className="bg-green-50 border border-green-200 p-4 rounded">
              <h3 className="font-semibold text-lg mb-2">Build Your Life List</h3>
              <p className="text-sm text-gray-600 mb-4">
                Select the birds you've already seen. These will be used to find hotspots with new species for you.
                <span className="block mt-1 text-green-700 font-medium">
                  {userLifeList.size} {userLifeList.size === 1 ? 'bird' : 'birds'} selected
                </span>
              </p>
              
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search birds..."
                  className="w-full p-2 border rounded mb-4"
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                
                <div className="max-h-96 overflow-y-auto border rounded divide-y">
                  {COMMON_CHICAGO_BIRDS
                    .filter(bird => 
                      bird.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      bird.code.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map(bird => (
                      <div 
                        key={bird.code}
                        className={`p-3 flex items-center hover:bg-gray-50 cursor-pointer ${userLifeList.has(bird.code) ? 'bg-blue-50' : ''}`}
                        onClick={() => toggleBirdInLifeList(bird.code)}
                      >
                        <input
                          type="checkbox"
                          checked={userLifeList.has(bird.code)}
                          onChange={() => {}}
                          className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 mr-3"
                        />
                        <span className="flex-1">{bird.name}</span>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          {bird.code}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
              
              <div className="flex justify-between items-center">
                <button
                  onClick={() => setStage('hotspots')}
                  className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
                >
                  ← Back to Hotspots
                </button>
                <button
                  onClick={calculateRecommendations}
                  disabled={userLifeList.size === 0}
                  className={`px-6 py-2 rounded text-white ${userLifeList.size > 0 ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'}`}
                >
                  Find Hotspots with New Birds →
                </button>
              </div>
            </div>

            <button
              onClick={calculateRecommendations}
              disabled={userLifeList.size === 0}
              className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 disabled:bg-gray-400 flex items-center gap-2"
            >
              <TrendingUp size={20} />
              Step 3: Calculate Recommendations
            </button>
          </div>
        )}

        {/* Recommendations Stage */}
        {stage === 'recommendations' && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 p-4 rounded">
              <p className="font-semibold">✓ Generated {recommendations.length} ranked recommendations</p>
              <p className="text-sm text-gray-600 mt-1">
                Based on {userLifeList.size} species in your life list
              </p>
            </div>

            <div className="space-y-3">
              {(recommendations as any[]).slice(0, 10).map((rec, idx) => (
                <div key={rec.hotspot.locId} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="inline-block bg-blue-600 text-white rounded-full w-8 h-8 text-center leading-8 font-bold mr-3">
                        {idx + 1}
                      </span>
                      <span className="font-semibold text-lg">{rec.hotspot.locName}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-green-600">{rec.expectedNewSpecies}</div>
                      <div className="text-xs text-gray-500">expected lifers</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                    <div>
                      <span className="text-gray-600">Total Possible:</span>
                      <span className="ml-2 font-semibold">{rec.newSpeciesCount} species</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Distance:</span>
                      <span className="ml-2 font-semibold">{rec.distance} km</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Score:</span>
                      <span className="ml-2 font-semibold">{rec.score}</span>
                    </div>
                  </div>

                  {rec.topNewSpecies.length > 0 && (
                    <div>
                      <div className="text-sm font-semibold text-gray-700 mb-1">Most Likely New Species:</div>
                      <div className="flex flex-wrap gap-2">
                        {rec.topNewSpecies.map((sp: any, i: number) => (
                          <span key={i} className="bg-green-50 text-green-800 px-2 py-1 rounded text-xs">
                            {sp.name} ({sp.probability}%)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                setStage('config');
                setHotspots([]);
                setSpeciesData({});
                setRecommendations([]);
                setUserLifeList(new Set());
              }}
              className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700"
            >
              Reset Pipeline
            </button>
          </div>
        )}
      </div>

      {/* Pipeline Visualization */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-bold mb-4">Pipeline Progress</h2>
        <div className="flex items-center justify-between">
          {['Config', 'Hotspots', 'Species', 'Recommendations'].map((s, idx) => (
            <React.Fragment key={s}>
              <div className={`flex flex-col items-center ${
                stage === s.toLowerCase() ? 'text-blue-600' : 
                ['hotspots', 'species', 'recommendations'].indexOf(stage) > ['hotspots', 'species', 'recommendations'].indexOf(s.toLowerCase()) 
                ? 'text-green-600' : 'text-gray-400'
              }`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 ${
                  stage === s.toLowerCase() ? 'border-blue-600 bg-blue-50' :
                  ['hotspots', 'species', 'recommendations'].indexOf(stage) > ['hotspots', 'species', 'recommendations'].indexOf(s.toLowerCase())
                  ? 'border-green-600 bg-green-50' : 'border-gray-300 bg-gray-50'
                }`}>
                  {idx + 1}
                </div>
                <span className="text-sm mt-2 font-medium">{s}</span>
              </div>
              {idx < 3 && (
                <div className={`flex-1 h-1 mx-2 ${
                  ['hotspots', 'species', 'recommendations'].indexOf(stage) > idx ? 'bg-green-600' : 'bg-gray-300'
                }`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LifeListOptimizer;
