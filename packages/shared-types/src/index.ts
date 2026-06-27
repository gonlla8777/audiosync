export type SignalingMessage = 
  | { type: 'create_room' }
  | { type: 'room_created'; roomId: string }
  | { type: 'join_room'; roomId: string }
  | { type: 'joined' }
  | { type: 'error'; message: string }
  | { type: 'webrtc_offer'; payload: any }
  | { type: 'webrtc_answer'; payload: any }
  | { type: 'webrtc_ice_candidate'; payload: any };