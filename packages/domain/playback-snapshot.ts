import type {MobilePlayback} from './mobile';

/** Bridge responses and pushed events can arrive in either order. */
export function acceptPlaybackSnapshot(current:MobilePlayback,incoming:MobilePlayback):MobilePlayback{
  const stamp=incoming.stamp;
  if(stamp&&(!Number.isSafeInteger(stamp.session)||!Number.isSafeInteger(stamp.sequence)||stamp.session<0||stamp.sequence<0))return current;
  if(!current.stamp)return incoming;
  if(!stamp)return current;
  return stamp.session>current.stamp.session||stamp.session===current.stamp.session&&stamp.sequence>current.stamp.sequence?incoming:current;
}
