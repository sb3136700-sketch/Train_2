import React, { useState, useEffect } from 'react';
import { 
  Train, 
  Clock, 
  MapPin, 
  Gauge, 
  Share2, 
  Bell, 
  Volume2, 
  Play, 
  Pause, 
  RotateCcw, 
  Utensils, 
  AlertCircle,
  Copy,
  Check,
  Compass,
  FileText,
  Car,
  Ticket,
  ExternalLink,
  Calculator,
  Building2,
  LayoutGrid,
  CheckSquare
} from 'lucide-react';
import { TrainDetails, RouteStop, DestinationAlarm, UserProfile } from '../types/railway';
import { playRailwayChime, playWakeupAlarm } from '../utils/audioChime';
import { DestinationWeatherCard } from './DestinationWeatherCard';
import { LuggageReminderCard } from './LuggageReminderCard';


interface LiveTrainApiData {
  trainNumber?: string;
  trainName?: string;
  lastUpdatedAt?: string;
  status?: string;
  delayMinutes?: number;
  isLive?: boolean;
  currentLocation?: { stationCode?: string; stationName?: string; sequence?: number; status?: string; isActualPosition?: boolean; segmentProgress?: number; speedKmh?: number; lat?: number; lng?: number; latitude?: number; longitude?: number; };
  previousHalt?: { stationCode?: string; stationName?: string; };
  nextHalt?: { stationCode?: string; stationName?: string; };
  route?: Array<{ sequence?: number; stationCode?: string; stationName?: string; lat?: number; lng?: number; distance?: number; }>;
}
interface LiveTrainApiEnvelope { success?: boolean; data?: LiveTrainApiData; error?: string | { message?: string }; }

interface JourneyTrackerProps {
  currentTrain: TrainDetails;
  allTrains: TrainDetails[];
  onSelectTrain: (train: TrainDetails) => void;
  alarm: DestinationAlarm;
  onOpenAlarmModal: () => void;
  onNavigateToRoute: () => void;
  onNavigateToNearby: () => void;
  onOpenComplaintModal: () => void;
  onOpenFoodModal: () => void;
  onOpenTicketModal: () => void;
  userProfile: UserProfile;
  onNavigateToPnrStatus?: () => void;
  onNavigateToFareCalculator?: () => void;
  onNavigateToCoachPosition?: () => void;
  onNavigateToStationInfo?: () => void;
  onNavigateToChecklist?: () => void;
}

export const JourneyTracker: React.FC<JourneyTrackerProps> = ({
  currentTrain,
  allTrains,
  onSelectTrain,
  alarm,
  onOpenAlarmModal,
  onNavigateToRoute,
  onNavigateToNearby,
  onOpenComplaintModal,
  onOpenFoodModal,
  onOpenTicketModal,
  userProfile,
  onNavigateToPnrStatus,
  onNavigateToFareCalculator,
  onNavigateToCoachPosition,
  onNavigateToStationInfo,
  onNavigateToChecklist,
}) => {
  const [stopIndex, setStopIndex] = useState(1);
  const [progressBetweenStops, setProgressBetweenStops] = useState(0.65);
  const [isSimulating, setIsSimulating] = useState(true);
  const [currentSpeed, setCurrentSpeed] = useState(currentTrain.avgSpeedKmph);
  const [copiedShare, setCopiedShare] = useState(false);
  const [alarmTriggered, setAlarmTriggered] = useState(false);
  const [liveStatus, setLiveStatus] = useState<LiveTrainApiData | null>(null);
  const [liveStatusError, setLiveStatusError] = useState('');
  const [liveStatusLoading, setLiveStatusLoading] = useState(false);
  const [liveRefreshCount, setLiveRefreshCount] = useState(0);

  const stops = currentTrain.routeStops;
  const currentApproachingStop: RouteStop = stops[stopIndex] || stops[stops.length - 1];
  const previousStop: RouteStop = stops[Math.max(0, stopIndex - 1)];

  const segStartKm = previousStop.distanceKm;
  const segEndKm = currentApproachingStop.distanceKm;
  const totalJourneyKm = currentTrain.totalDistanceKm;
  
  const currentKm = Math.round(segStartKm + (segEndKm - segStartKm) * progressBetweenStops);
  const remainingKm = Math.max(0, totalJourneyKm - currentKm);
  const totalPercent = Math.min(100, Math.max(0, Math.round((currentKm / totalJourneyKm) * 100)));

  // Fetch real railway running status from our server-side proxy; refresh every five minutes.
  useEffect(() => {
    let cancelled = false;
    const loadLiveStatus = async () => {
      setLiveStatusLoading(true);
      try {
        const response = await fetch('/api/train-live/' + encodeURIComponent(currentTrain.trainNumber), { cache: 'no-store' });
        const payload = await response.json() as LiveTrainApiEnvelope;
        if (!response.ok || payload.success !== true || !payload.data) {
          const apiError = typeof payload.error === 'string' ? payload.error : payload.error?.message;
          throw new Error(apiError || 'Live train data could not be loaded.');
        }
        if (!cancelled) { setLiveStatus(payload.data); setLiveStatusError(''); }
      } catch (error) {
        if (!cancelled) {
          setLiveStatus(null);
          setLiveStatusError(error instanceof Error ? error.message : 'Live railway data is unavailable.');
        }
      } finally {
        if (!cancelled) setLiveStatusLoading(false);
      }
    };
    void loadLiveStatus();
    const intervalId = window.setInterval(() => void loadLiveStatus(), 5 * 60 * 1000);
    return () => { cancelled = true; window.clearInterval(intervalId); };
  }, [currentTrain.trainNumber, liveRefreshCount]);
  // Simulation timer
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      setProgressBetweenStops((prev) => {
        if (prev >= 0.98) {
          setStopIndex((currIdx) => {
            if (currIdx < stops.length - 1) {
              return currIdx + 1;
            } else {
              setIsSimulating(false);
              return currIdx;
            }
          });
          return 0.05;
        }
        return prev + 0.02;
      });

      setCurrentSpeed((base) => {
        const jitter = Math.floor(Math.random() * 7) - 3;
        return Math.min(currentTrain.maxSpeedKmph, Math.max(45, base + jitter));
      });
    }, 1800);

    return () => clearInterval(interval);
  }, [isSimulating, stops.length, currentTrain.maxSpeedKmph]);

  // Alarm sound trigger
  useEffect(() => {
    if (alarm.enabled && !alarm.soundPlayed && !alarmTriggered) {
      if (alarm.stationCode === currentApproachingStop.stationCode) {
        if (progressBetweenStops > 0.8) {
          setAlarmTriggered(true);
          playRailwayChime().then(() => {
            playWakeupAlarm();
          });
        }
      }
    }
  }, [alarm, currentApproachingStop.stationCode, progressBetweenStops, alarmTriggered]);

  const liveRoute = liveStatus?.route ?? [];
  const providerLocation = liveStatus?.currentLocation;
  const currentLocationPoint = liveRoute.find((point) => point.stationCode === providerLocation?.stationCode);
  const previousLocationPoint = liveRoute.find((point) => point.stationCode === liveStatus?.previousHalt?.stationCode);
  const nextLocationPoint = liveRoute.find((point) => point.stationCode === liveStatus?.nextHalt?.stationCode);
  const hasDirectCoordinates = typeof providerLocation?.lat === 'number' && Number.isFinite(providerLocation.lat) && typeof providerLocation?.lng === 'number' && Number.isFinite(providerLocation.lng);
  const hasInterpolatedCoordinates = typeof previousLocationPoint?.lat === 'number' && typeof previousLocationPoint?.lng === 'number' && typeof nextLocationPoint?.lat === 'number' && typeof nextLocationPoint?.lng === 'number' && typeof providerLocation?.segmentProgress === 'number' && Number.isFinite(providerLocation.segmentProgress);
  const segmentProgress = hasInterpolatedCoordinates ? Math.min(1, Math.max(0, providerLocation?.segmentProgress ?? 0)) : 0;
  const liveLatitude = hasDirectCoordinates ? providerLocation?.lat : hasInterpolatedCoordinates ? previousLocationPoint!.lat! + (nextLocationPoint!.lat! - previousLocationPoint!.lat!) * segmentProgress : currentLocationPoint?.lat;
  const liveLongitude = hasDirectCoordinates ? providerLocation?.lng : hasInterpolatedCoordinates ? previousLocationPoint!.lng! + (nextLocationPoint!.lng! - previousLocationPoint!.lng!) * segmentProgress : currentLocationPoint?.lng;
  const hasLiveMapPoint = typeof liveLatitude === 'number' && Number.isFinite(liveLatitude) && typeof liveLongitude === 'number' && Number.isFinite(liveLongitude);
  const liveMapUrl = hasLiveMapPoint ? 'https://www.google.com/maps?q=' + liveLatitude + ',' + liveLongitude : providerLocation?.stationCode ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(providerLocation.stationCode + ' railway station India') : '';
  const currentLiveStation = providerLocation?.stationName || currentLocationPoint?.stationName || providerLocation?.stationCode || 'Not reported';
  const nextLiveStation = liveStatus?.nextHalt?.stationName || liveStatus?.nextHalt?.stationCode || 'Not reported';
  const lastLiveUpdate = liveStatus?.lastUpdatedAt ? new Date(liveStatus.lastUpdatedAt).toLocaleString() : 'Time not supplied by provider';
  const shareText = liveStatus
    ? '🚆 LIVE TRAIN RUNNING STATUS\nTrain: ' + (liveStatus.trainNumber || currentTrain.trainNumber) + ' ' + (liveStatus.trainName || currentTrain.trainName) + '\nStatus: ' + (liveStatus.status || 'Not reported') + '\nCurrent reported location: ' + currentLiveStation + '\nNext halt: ' + nextLiveStation + '\nDelay: ' + (typeof liveStatus.delayMinutes === 'number' ? liveStatus.delayMinutes + ' minutes' : 'Not reported') + '\nSpeed: ' + (typeof providerLocation?.speedKmh === 'number' ? providerLocation.speedKmh + ' km/h' : 'Not reported') + (liveMapUrl ? '\nMap: ' + liveMapUrl : '') + '\nLast updated: ' + lastLiveUpdate + '\nNote: Train status is provided by the railway data feed.'
    : '🚆 Train: ' + currentTrain.trainNumber + ' ' + currentTrain.trainName + '\nLive train location is currently unavailable in this app. The route animation is demo-only, not railway GPS. Please refresh later or configure the railway live-status API key on the server.';
  const whatsappShareUrl = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(shareText);

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2500);
    }
  };

  const resetSimulation = () => {
    setStopIndex(1);
    setProgressBetweenStops(0.1);
    setIsSimulating(true);
    setAlarmTriggered(false);
  };

  return (
    <div className="space-y-6">
      {/* Alarm Banner Alert when triggered */}
      {alarmTriggered && (
        <div className="flex items-center justify-between p-4 rounded-2xl bg-amber-500/20 border-2 border-amber-500 text-amber-300 animate-pulse neon-glow-amber">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-slate-950 font-bold">
              <Bell className="h-5 w-5 animate-bounce" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">
                STATION ALARM: Approaching {currentApproachingStop.stationName} ({currentApproachingStop.stationCode})!
              </div>
              <div className="text-xs text-amber-200">
                Scheduled arrival: {currentApproachingStop.arrivalTime} · Platform {currentApproachingStop.platform}. Get ready to deboard!
              </div>
            </div>
          </div>
          <button
            onClick={() => setAlarmTriggered(false)}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Train Selector & Telemetry Banner */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl neon-glow-amber">
        <div className="flex items-center gap-3.5">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 border border-amber-500/40 text-amber-400 shadow-inner">
            <Train className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-400 font-mono tracking-wider">
                {currentTrain.trainNumber}
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-xs font-semibold text-slate-300">
                {currentTrain.type}
              </span>
              <span className="text-slate-500">·</span>
              <span className={`text-xs font-semibold ${liveStatus ? (typeof liveStatus.delayMinutes === 'number' && liveStatus.delayMinutes > 0 ? 'text-amber-400' : 'text-emerald-400') : 'text-slate-400'}`}>
                {liveStatus
                  ? (typeof liveStatus.delayMinutes === 'number'
                    ? (liveStatus.delayMinutes > 0 ? '▲ Delay ' + liveStatus.delayMinutes + 'm' : '● ' + (liveStatus.status || 'Live status received'))
                    : '● ' + (liveStatus.status || 'Live status received'))
                  : 'Live status shown below'}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {currentTrain.trainName}
            </h1>
            <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
              <span>{currentTrain.sourceName} ({currentTrain.sourceCode})</span>
              <span>→</span>
              <span>{currentTrain.destName} ({currentTrain.destCode})</span>
              <span>·</span>
              <span>{currentTrain.duration}</span>
            </div>
          </div>
        </div>

        {/* Action Controls: Live WhatsApp Location Share + Quick Dropdown */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto lg:justify-end">
          <select
            value={currentTrain.trainNumber}
            onChange={(e) => {
              const tr = allTrains.find((t) => t.trainNumber === e.target.value);
              if (tr) {
                onSelectTrain(tr);
                setStopIndex(1);
                setProgressBetweenStops(0.2);
              }
            }}
            className="flex-1 lg:flex-initial rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-white focus:border-amber-500 focus:outline-none"
          >
            {allTrains.map((t) => (
              <option key={t.trainNumber} value={t.trainNumber}>
                {t.trainNumber} - {t.trainName}
              </option>
            ))}
          </select>

          <a
            href={whatsappShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-9 items-center justify-center gap-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow whitespace-nowrap"
            title="Share railway live status and reported location on WhatsApp"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span>Share Train Status</span>
          </a>

          <button
            onClick={handleShare}
            className="flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
          >
            {copiedShare ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{copiedShare ? 'Copied' : 'Copy Status'}</span>
          </button>
        </div>
      </div>

      {/* Railway feed is separate from the local route animation. */}
      <section className="rounded-2xl border border-cyan-500/30 bg-slate-900/90 p-5 shadow-xl" aria-live="polite">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
              <MapPin className="h-4 w-4" />
              Railway Live Running Status
            </div>
            <p className="mt-1 text-xs text-slate-400">Actual railway feed, separate from the demo route animation.</p>
          </div>
          <button type="button" onClick={() => setLiveRefreshCount((count) => count + 1)} disabled={liveStatusLoading} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/20 disabled:cursor-wait disabled:opacity-60">
            <RotateCcw className={'h-3.5 w-3.5 ' + (liveStatusLoading ? 'animate-spin' : '')} />
            {liveStatusLoading ? 'Checking feed…' : 'Refresh live status'}
          </button>
        </div>
        {liveStatus ? (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
              <div className="text-[11px] text-slate-400">Reported position</div>
              <div className="mt-1 text-base font-bold text-white">{currentLiveStation}</div>
              <div className="mt-1 text-[11px] text-slate-400">Next halt: <span className="text-slate-200">{nextLiveStation}</span></div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
              <div className="text-[11px] text-slate-400">Live telemetry</div>
              <div className="mt-1 text-base font-bold text-white">{typeof providerLocation?.speedKmh === 'number' ? providerLocation.speedKmh + ' km/h' : 'Speed not reported'}</div>
              <div className="mt-1 text-[11px] text-slate-400">Delay: <span className="text-slate-200">{typeof liveStatus.delayMinutes === 'number' ? liveStatus.delayMinutes + ' min' : 'Not reported'}</span></div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
              <div className="text-[11px] text-slate-400">Provider update</div>
              <div className="mt-1 text-sm font-semibold text-white">{liveStatus.status || 'Running status received'}</div>
              <div className="mt-1 text-[11px] text-slate-400">{lastLiveUpdate}</div>
            </div>
            <div className="md:col-span-3 flex flex-wrap items-center gap-3 pt-1">
              {liveMapUrl && <a href={liveMapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400"><MapPin className="h-3.5 w-3.5" />Open reported position in Maps</a>}
              <span className="text-[11px] text-slate-400">{hasDirectCoordinates ? 'Coordinates supplied by the live provider.' : hasInterpolatedCoordinates ? 'Map point estimated from provider segment progress and station coordinates.' : 'Map link uses the reported station; exact between-station GPS coordinates were not supplied.'}</span>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
            <p className="text-sm font-semibold text-amber-200">{liveStatusLoading ? 'Connecting to the railway live-status provider…' : 'Live railway feed not connected'}</p>
            <p className="mt-1 text-xs text-slate-300">{liveStatusError || 'Waiting for a response from the railway data provider.'}</p>
            <p className="mt-2 text-xs text-slate-400">Add <code className="rounded bg-slate-950 px-1.5 py-0.5 text-cyan-300">RAILRADAR_API_KEY</code> to the server environment, then restart/redeploy. The key must stay server-side.</p>
            <a href="https://railradar.in/docs/live-train-status" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-semibold text-cyan-300 underline underline-offset-4">Live API setup documentation</a>
          </div>
        )}
      </section>

      {/* Quick Action Matrix for Commuters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {/* Cabs / Auto (Ola, Uber, Rapido) */}
        <button
          onClick={onNavigateToNearby}
          className="flex h-full min-w-0 items-center gap-2.5 p-3 rounded-xl border border-lime-500/40 bg-slate-900/90 hover:bg-slate-800 text-left transition-all shadow hover:shadow-lime-500/20 group"
        >
          <div className="h-8 w-8 rounded-lg bg-lime-500/10 text-lime-400 flex items-center justify-center shrink-0">
            <Car className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white group-hover:text-lime-300">Book Ola / Uber</div>
            <div className="text-[10px] text-slate-400">Rapido & Station Autos</div>
          </div>
        </button>

        {/* Food Order to Seat */}
        <button
          onClick={onOpenFoodModal}
          className="flex h-full min-w-0 items-center gap-2.5 p-3 rounded-xl border border-amber-500/40 bg-slate-900/90 hover:bg-slate-800 text-left transition-all shadow hover:shadow-amber-500/20 group"
        >
          <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
            <Utensils className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white group-hover:text-amber-300">Order Food to Seat</div>
            <div className="text-[10px] text-slate-400">IRCTC e-Catering & Pantry</div>
          </div>
        </button>

        {/* RailMadad Official Complaint */}
        <button
          onClick={onOpenComplaintModal}
          className="flex h-full min-w-0 items-center gap-2.5 p-3 rounded-xl border border-red-500/40 bg-slate-900/90 hover:bg-slate-800 text-left transition-all shadow hover:shadow-red-500/20 group"
        >
          <div className="h-8 w-8 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center shrink-0">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white group-hover:text-red-300">RailMadad Complaint</div>
            <div className="text-[10px] text-slate-400">Cleanliness & Medical</div>
          </div>
        </button>

        {/* E-Ticket Download / Print */}
        <button
          onClick={onOpenTicketModal}
          className="flex h-full min-w-0 items-center gap-2.5 p-3 rounded-xl border border-cyan-500/40 bg-slate-900/90 hover:bg-slate-800 text-left transition-all shadow hover:shadow-cyan-500/20 group"
        >
          <div className="h-8 w-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0">
            <Ticket className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white group-hover:text-cyan-300">Download E-Ticket</div>
            <div className="text-[10px] text-slate-400">Print / IRCTC Slip</div>
          </div>
        </button>
      </div>

      {/* Smart Rail Tools Strip (PNR, Fare, Coach Position, Station Info, Checklist) */}
      <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
        <span className="text-slate-400 font-semibold px-1">Passenger Utilities:</span>
        {onNavigateToPnrStatus && (
          <button
            onClick={onNavigateToPnrStatus}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold transition-colors"
          >
            <Ticket className="h-3.5 w-3.5" />
            <span>Check PNR Status</span>
          </button>
        )}
        {onNavigateToFareCalculator && (
          <button
            onClick={onNavigateToFareCalculator}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-semibold transition-colors"
          >
            <Calculator className="h-3.5 w-3.5" />
            <span>Fare Calculator</span>
          </button>
        )}
        {onNavigateToCoachPosition && (
          <button
            onClick={onNavigateToCoachPosition}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 font-semibold transition-colors"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>Coach Position</span>
          </button>
        )}
        {onNavigateToStationInfo && (
          <button
            onClick={onNavigateToStationInfo}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 font-semibold transition-colors"
          >
            <Building2 className="h-3.5 w-3.5" />
            <span>Station Info & Navigation</span>
          </button>
        )}
        {onNavigateToChecklist && (
          <button
            onClick={onNavigateToChecklist}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold transition-colors"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            <span>Packing Checklist</span>
          </button>
        )}
      </div>

      {/* Main Telemetry Gauges with Neon Glow */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Speedometer Gauge (Neon Emerald) */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 flex flex-col justify-between neon-glow-emerald">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-bold text-emerald-400">Demo Speed Animation</span>
            <div className="flex items-center gap-1.5">
              <span className={`inline-block h-2 w-2 rounded-full ${isSimulating ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
              <span className="font-semibold">{liveStatus ? 'Live data shown above' : isSimulating ? 'Demo animation running' : 'Demo paused'}</span>
            </div>
          </div>

          <div className="my-4 flex items-baseline gap-2">
            <span className="text-5xl font-black text-white font-mono tracking-tight neon-text-cyan">
              {currentSpeed}
            </span>
            <span className="text-sm font-bold text-slate-400">km/h</span>
            <div className="ml-auto text-right text-xs text-slate-400">
              <div>Top Speed: {currentTrain.maxSpeedKmph} km/h</div>
              <div>Average: {currentTrain.avgSpeedKmph} km/h</div>
            </div>
          </div>

          <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-emerald-500 via-cyan-400 to-amber-500 h-2.5 rounded-full transition-all duration-700 shadow"
              style={{ width: `${Math.min(100, (currentSpeed / currentTrain.maxSpeedKmph) * 100)}%` }}
            />
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400">Demo controls:</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setIsSimulating(!isSimulating)}
                className="inline-flex items-center justify-center gap-1 min-h-8 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-colors"
              >
                {isSimulating ? <Pause className="h-3.5 w-3.5 text-amber-400" /> : <Play className="h-3.5 w-3.5 text-emerald-400" />}
                <span>{isSimulating ? 'Pause' : 'Resume'}</span>
              </button>
              <button
                onClick={resetSimulation}
                className="inline-flex items-center justify-center gap-1 min-h-8 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Approaching Station Spotlight (Neon Amber) */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 flex flex-col justify-between neon-glow-amber">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-bold text-amber-400">Demo Next Station</span>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-slate-800 text-amber-300 border border-slate-700">
              Platform {currentApproachingStop.platform}
            </span>
          </div>

          <div className="my-3">
            <div className="text-2xl font-black text-white flex items-center gap-2">
              <span>{currentApproachingStop.stationName}</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                {currentApproachingStop.stationCode}
              </span>
            </div>
            <div className="text-xs text-slate-300 mt-1 flex items-center gap-2">
              <span>ETA: <strong className="text-white font-mono text-sm">{currentApproachingStop.arrivalTime}</strong></span>
              <span>·</span>
              <span>Halt: {currentApproachingStop.haltMinutes > 0 ? `${currentApproachingStop.haltMinutes} mins` : 'Terminus'}</span>
            </div>
          </div>

          {currentApproachingStop.localSpecialty && (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
              <div className="flex items-center gap-1.5 text-amber-300 font-bold text-[11px]">
                <Utensils className="h-3 w-3" />
                <span>Station Food: {currentApproachingStop.localSpecialty.dish}</span>
              </div>
              <p className="text-slate-300 text-[11px] truncate mt-0.5">
                {currentApproachingStop.localSpecialty.description}
              </p>
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>Distance to stop:</span>
            <span className="font-mono text-white font-bold text-sm">
              {Math.max(0, currentApproachingStop.distanceKm - currentKm)} km
            </span>
          </div>
        </div>

        {/* Progress & Wake-up Alarm */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 flex flex-col justify-between neon-glow-cyan">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-bold text-cyan-400">Demo Journey Progress</span>
            <span className="font-mono text-cyan-300 font-bold">{totalPercent}%</span>
          </div>

          <div className="my-3 space-y-2">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-slate-400">Covered: <strong className="text-white font-mono">{currentKm} km</strong></span>
              <span className="text-slate-400">Remaining: <strong className="text-white font-mono">{remainingKm} km</strong></span>
            </div>
            
            <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-cyan-400 h-2.5 rounded-full transition-all duration-700 shadow"
                style={{ width: `${totalPercent}%` }}
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className={`h-4 w-4 ${alarm.enabled ? 'text-amber-400 animate-pulse' : 'text-slate-500'}`} />
              <div className="text-xs">
                <div className="font-semibold text-white">
                  {alarm.enabled ? `Alarm: ${alarm.stationCode}` : 'Station Alarm Inactive'}
                </div>
                <div className="text-[11px] text-slate-400">
                  {alarm.enabled ? `${alarm.offsetMinutes} mins prior chime` : 'Auto wake-up chime'}
                </div>
              </div>
            </div>
            <button
              onClick={onOpenAlarmModal}
              className="px-3 py-1.5 text-xs rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-colors shadow"
            >
              {alarm.enabled ? 'Edit' : 'Set Alarm'}
            </button>
          </div>
        </div>
      </div>

      {/* Visual Corridor Stations Tracker */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white">Demo Route Animation</h3>
            <p className="text-xs text-slate-400">Illustrative route progress only — not live GPS</p>
          </div>
          <button
            onClick={onNavigateToRoute}
            className="text-xs text-amber-400 hover:text-amber-300 font-semibold underline underline-offset-4"
          >
            View Full Timetable & Halts →
          </button>
        </div>

        <div className="relative pt-6 pb-2 overflow-x-auto">
          <div className="relative flex justify-between items-start min-w-[500px]">
            {/* Track Line */}
            <div className="absolute top-4 left-6 right-6 h-1.5 bg-slate-800 rounded-full" />
            <div 
              className="absolute top-4 left-6 h-1.5 bg-gradient-to-r from-emerald-500 via-amber-400 to-cyan-400 rounded-full transition-all duration-700"
              style={{ width: `calc(${totalPercent}% * 0.9 + 2%)` }}
            />

            {stops.map((stop, idx) => {
              const isPassed = idx < stopIndex;
              const isCurrent = idx === stopIndex;

              return (
                <div key={stop.stationCode} className="flex flex-col items-center text-center max-w-[100px] z-10">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all ${
                      isPassed
                        ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
                        : isCurrent
                        ? 'border-amber-400 bg-amber-500 text-slate-950 font-black scale-110 shadow-lg shadow-amber-500/50 animate-pulse'
                        : 'border-slate-700 bg-slate-900 text-slate-500'
                    }`}
                  >
                    {isCurrent ? <Train className="h-4 w-4" /> : <span className="text-[10px] font-mono">{idx + 1}</span>}
                  </div>

                  <div className="mt-2">
                    <div className={`text-xs font-bold ${isCurrent ? 'text-amber-400' : 'text-slate-200'}`}>
                      {stop.stationCode}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate max-w-[90px]">
                      {stop.stationName}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      {stop.arrivalTime}
                    </div>
                    <div className="text-[9px] text-slate-500">
                      PF {stop.platform}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Destination Weather & Deboarding Luggage Reminder Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DestinationWeatherCard
          destinationCity={currentTrain.destName.split(' ')[0]}
          stationCode={currentTrain.destCode}
        />
        <LuggageReminderCard />
      </div>
    </div>
  );
};
