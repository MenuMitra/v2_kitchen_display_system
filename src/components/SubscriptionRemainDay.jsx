import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { ENV } from '../config/env';
import { V2_COMMON_BASE } from '../config';
import { useNavigate } from 'react-router-dom';

const SubscriptionRemainDay = ({ selectedOutlet, dateRange, subscriptionData: propSubscriptionData }) => {
  const [subscriptionData, setSubscriptionData] = useState(propSubscriptionData || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const DEFAULT_TOTAL_DAYS = 30;

  const authData = localStorage.getItem("authData");
  let token = null;
  if (authData) {
    try {
      token = JSON.parse(authData).access_token;
    } catch (err) {
      console.error("Failed to parse authData", err);
    }
  }

  const fetchSubscriptionData = async ({ queryKey }) => {
    const [, outletId, currentDateRange] = queryKey;
    if (!outletId || !token) return null;
    try {
      const requestPayload = {
        outlet_id: outletId,
        date_filter: currentDateRange || 'today',
        owner_id: 1,
        app_source: 'admin',
      };
      const response = await axios.post(
        `${V2_COMMON_BASE}/cds_kds_order_listview`,
        requestPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = response.data;
      return data && data.subscription_details ? data.subscription_details : null;
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.clear();
        navigate('/login');
        return null;
      }
      throw err;
    }
  };

  const { data: subscriptionFromQuery, isLoading, error: queryError } = useQuery({
    queryKey: ['subscription', selectedOutlet?.outlet_id, dateRange],
    enabled: !!selectedOutlet?.outlet_id && !propSubscriptionData,
    queryFn: fetchSubscriptionData,
  });

  useEffect(() => {
    if (propSubscriptionData) {
      setSubscriptionData(propSubscriptionData);
      setError('');
      setLoading(false);
    } else {
      setSubscriptionData(subscriptionFromQuery || null);
      setError(queryError ? 'Failed to fetch subscription data' : '');
      setLoading(!!isLoading);
    }
  }, [propSubscriptionData, subscriptionFromQuery, isLoading, queryError]);

  const parseDateSafe = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  };

  // Hide timeline until outlet is selected
  if (!selectedOutlet || !selectedOutlet.outlet_id) {
    return null;
  }

  const currentDate = new Date();
  const startDate = parseDateSafe(subscriptionData?.start_date);
  const endDate = parseDateSafe(subscriptionData?.end_date);

  const hasValidTimeline = !!startDate && !!endDate && endDate >= startDate;

  const totalDays = hasValidTimeline
    ? Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)))
    : DEFAULT_TOTAL_DAYS;

  const completedDaysRaw = hasValidTimeline
    ? Math.floor((currentDate - startDate) / (1000 * 60 * 60 * 24))
    : 0;
  const completedDays = Math.min(totalDays, Math.max(0, completedDaysRaw));

  const remainingDaysRaw = hasValidTimeline
    ? Math.ceil((endDate - currentDate) / (1000 * 60 * 60 * 24))
    : DEFAULT_TOTAL_DAYS;
  const remainingDays = Math.max(0, remainingDaysRaw);

  const percentage = totalDays > 0 ? (completedDays / totalDays) * 100 : 0;

  let color = '#177841';
  if (remainingDays <= 5) {
    color = '#d10606';
  } else if (remainingDays <= 15) {
    color = '#F59E0B';
  }

  // Show timeline only when 30 days or less are remaining.
  if (remainingDays > 30) {
    return null;
  }

  return (
    <div className="flex justify-center w-full mb-2.5">
      <div className="bg-white rounded-lg shadow-[0_1px_4px_rgba(80,89,111,0.06)] border border-[#ededed] w-full max-w-[300px] mx-auto">
        <div className="px-3 pt-2 pb-1.5">
          <div className="font-semibold text-[0.85rem] text-[#222] mb-1">
            Timeline
          </div>
          <div className="w-full mb-1.5">
            <div className="h-4 rounded-lg bg-[#e4e6ea] relative overflow-hidden w-full">
              <div
                className="absolute top-0 left-0 h-full rounded-lg transition-all duration-300 z-10"
                style={{
                  width: `${percentage}%`,
                  background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
                }}
              />
            </div>
          </div>
          <div className="flex justify-between text-xs mx-0.5">
            <span className="text-gray-700 font-medium">{completedDays} days completed</span>
            <span className={`font-medium ${remainingDays <= 5 ? 'text-red-500' : 'text-gray-700'}`}>{remainingDays} days remaining</span>
          </div>
          {loading && <div className="text-[11px] text-gray-400 mt-1">Updating timeline...</div>}
          {!hasValidTimeline && (
            <div className="text-[11px] text-gray-400 mt-1">
              Using default {DEFAULT_TOTAL_DAYS}-day timeline
            </div>
          )}
          {error && <div className="text-[11px] text-yellow-700 mt-1">{error}</div>}
        </div>
      </div>
    </div>
  );
};

export default SubscriptionRemainDay;