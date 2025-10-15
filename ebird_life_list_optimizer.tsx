import React, { useState } from 'react';
import { MapPin, Bird, Calendar, TrendingUp } from 'lucide-react';

// eBird API configuration
const EBIRD_API_KEY = 'YOUR_API_KEY_HERE'; // User needs to get this from ebird.org/api/keygen
const EBIRD_API_BASE = 'https://api.ebird.org/v2';

const LifeListOptimizer = () => {
  const [stage, setStage] = useState('config');
  const [hotspots, setHotspots] = useState([]);
  const [speciesData, setSpeciesData] = useState({});
  const [userLifeList, setUserLifeList] = useState(new Set());
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Chicago West Side approximate bounds
  const CHICAGO_WEST = {
    name: "Chicago West Side",
    lat: 41.88,
    lng: -87.75,
    radius: 25 // km
  };

  // Step 1: Fetch hotspots in the region
  const fetchHotspots = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${EBIRD_API_BASE}/ref/hotspot/US-IL?fmt=json`,
        {
          headers: { 'X-eBirdApiToken': EBIRD_API_KEY }
        }
      );
      
      if (!response.ok) throw new Error('Failed to fetch hotspots');
      
      const allHotspots = await response.json();
      
      // Filter to west side area (rough bounding box)
      const westSideHotspots = allHotspots.filter(h => {
        const distance = calculateDistance(
          CHICAGO_WEST.lat, CHICAGO_WEST.lng,
          h.lat, h.lng
        );
        return distance <= CHICAGO_WEST.radius;
      }).slice(0, 20); // Limit to 20 for toy model
      
      setHotspots(westSideHotspots);
      setStage('hotspots');
      return westSideHotspots;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Fetch recent observations for each hotspot
  const fetchHotspotSpecies = async (hotspotId) => {
    try {
      const response = await fetch(
        `${EBIRD_API_BASE}/data/obs/${hotspotId}/recent?back=30`,
        {
          headers: { 'X-eBirdApiToken': EBIRD_API_KEY }
        }
      );
      
      if (!response.ok) throw new Error(`Failed to fetch species for ${hotspotId}`);
      
      const observations = await response.json();
      
      // Calculate species frequency
      const speciesFrequency = {};
      observations.forEach(obs => {
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
      const results = {};
      
      // Process hotspots in batches to avoid rate limits
      for (const hotspot of hotspots) {
        const data = await fetchHotspotSpecies(hotspot.locId);
        results[hotspot.locId] = data;
        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      setSpeciesData(results);
      setStage('species');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Calculate recommendations based on life list
  const calculateRecommendations = () => {
    const recs = hotspots.map(hotspot => {
      const hotspotData = speciesData[hotspot.locId];
      if (!hotspotData) return null;

      // Count species not on life list
      const newSpecies = Object.entries(hotspotData.species).filter(
        ([code, _]) => !userLifeList.has(code)
      );

      // Calculate probability-weighted expected value
      const expectedNewSpecies = newSpecies.reduce((sum, [_, data]) => {
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
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 5)
          .map(([_, data]) => ({
            name: data.commonName,
            probability: ((data.count / hotspotData.totalChecklists) * 100).toFixed(0)
          }))
      };
    }).filter(r => r !== null);

    recs.sort((a, b) => b.score - a.score);
    setRecommendations(recs);
    setStage('recommendations');
  };

  // Helper: Calculate distance between two lat/lng points (Haversine)
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
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

  const toRad = (deg) => deg * (Math.PI/180);

  // Demo: Add some common birds to life list
  const addDemoLifeList = () => {
    const commonBirds = new Set([
      'norcad', 'amerob', 'bkcchi', 'carwre', 'dowwoo',
      'haiwoo', 'rebwoo', 'amecro', 'amegfi', 'blujay',
      'mourdo', 'eucspa', 'norfli', 'whbnut', 'rebnut'
    ]);
    setUserLifeList(commonBirds);
  };

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
                <li>Replace 'YOUR_API_KEY_HERE' in the code</li>
                <li>Click "Fetch Hotspots" to begin</li>
              </ol>
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
              disabled={loading}
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
              {hotspots.map(h => (
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

        {/* Species Stage */}
        {stage === 'species' && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 p-4 rounded">
              <p className="font-semibold">✓ Processed species data for {Object.keys(speciesData).length} hotspots</p>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded">
              <h3 className="font-semibold mb-2">Demo Mode:</h3>
              <p className="text-sm mb-3">
                Add a demo life list of 15 common birds to see recommendations
              </p>
              <button
                onClick={addDemoLifeList}
                className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700 text-sm"
              >
                Add Demo Life List ({userLifeList.size} birds)
              </button>
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
              {recommendations.slice(0, 10).map((rec, idx) => (
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
                        {rec.topNewSpecies.map((sp, i) => (
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